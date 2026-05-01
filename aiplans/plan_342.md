# Plan 342: `invert_marker_locks` tool

## Use case

Add an AI chat tool `invert_marker_locks` that flips the `lock` flag
on every marker in `pack.markers`. This mirrors the legacy
`invertLock` function in `public/modules/ui/markers-overview.js`
(line 128), which is wired to the "Invert lock" row-toolbar button:

```js
function invertLock() {
  pack.markers = pack.markers.map(marker => ({...marker, lock: !marker.lock}));
  addLines();
}
```

The user can already trigger this via the "Invert lock" button in the
markers overview. The AI cannot. The `lock` flag controls which
markers survive the bulk "Remove all markers" wipe — locked markers
are preserved.

We already have:

- `set_marker_lock` (per-marker lock flag toggle — uses
  `delete marker.lock` for the "off" path)
- `invert_marker_pins` (plan 341, just merged — bulk invert pinned)
- `remove_all_markers` (plan 340, just merged — destroys non-locked
  markers; uses `pack.markers = pack.markers.filter(...)`
  REASSIGNMENT pattern)
- the rest of the marker family (`add_marker`, `remove_marker`,
  `set_marker_pin`, `set_marker_note`, etc.)

This plan adds the missing **bulk invert lock** action — completing
the marker bulk-action set alongside `invert_marker_pins`.

## Critical implementation note (LOAD-BEARING)

The legacy `invertLock` REASSIGNS `pack.markers` to a NEW array of
CLONED marker objects (`{...marker, lock: !marker.lock}`). It does
NOT mutate the existing marker objects in place. This is **different
from** `invert_marker_pins` (plan 341), which mutates in place.

We mirror the legacy semantics: REASSIGNMENT, not in-place. This
matters for downstream code: any stale reference to the OLD
`pack.markers` array (e.g. saved into a closure) will not see the
new lock values. The tests verify both:

- the array identity changes (`pack.markers !== oldRef`)
- the original marker objects survive UNCHANGED (their `lock` field
  is whatever it was before the call)

The legacy uses plain boolean `!marker.lock` semantics — does NOT
use `delete`. So `marker.lock = true` for previously-unlocked,
`marker.lock = false` for previously-locked. (Compare to
`invert_marker_pins` which uses `delete` for the off path.) In
particular, `!undefined === true`, so a marker without a `lock`
field becomes `lock: true` after the flip.

The legacy `pack.markers.map(...)` iterates **ALL** markers,
including any with `removed === true`. We mirror that — do NOT skip
removed markers. If the AI wants to filter, that's a separate
operation.

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-342-invert-marker-locks`, master @ 4f3bad3, working
tree clean for `src/`) reports:

```
Checked 789 files in 628ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this.

## Behavior

- Get `pack.markers` via the runtime. If missing or not an array →
  error.
- Build a new array via `.map(m => ({ ...m, lock: !m.lock }))`. Each
  element is a SHALLOW CLONE of the original marker object with
  `lock` set to the boolean negation of the previous value
  (`!undefined === true`).
- Reassign `pack.markers` to the new array via `runtime.setMarkers`.
- Best-effort: call `addLines()` if available, swallow errors.
  (Legacy `invertLock` calls `addLines()` to refresh the markers
  overview rows; if the overview isn't open, the global is undefined
  and we skip.)
- Compute the summary:
  - `total` = number of markers in the new array.
  - `now_locked` = count where `marker.lock === true` after the flip.
  - `now_unlocked` = `total - now_locked`.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields, no parameters.

### Validation

- `pack.markers` must exist and be an array.

### Errors (verbatim)

- `"window.pack.markers is not available; the map hasn't finished loading."`
  — pack missing or `markers` not an array.
- Runtime errors thrown by the runtime (e.g. `setMarkers` failing)
  are propagated via `errorResult(err.message)`.

### Success result

```jsonc
{
  "ok": true,
  "total": M,
  "now_locked": N,
  "now_unlocked": K
}
```

`now_locked + now_unlocked === total`.

## Files

- **NEW** `src/ai/tools/invert-marker-locks.ts` — the tool.
  Exports:
  - `interface InvertMarkerLocksResult { total: number; now_locked: number; now_unlocked: number; }`
  - `interface InvertMarkerLocksRuntime`:
    ```ts
    {
      getMarkers(): RawMarker[] | undefined;
      setMarkers(arr: RawMarker[]): void;
      addLines?: () => void;
    }
    ```
  - `defaultInvertMarkerLocksRuntime`:
    - `getMarkers()`:
      ```ts
      const pack = getPack<{ markers?: RawMarker[] }>();
      const markers = pack?.markers;
      return Array.isArray(markers) ? markers : undefined;
      ```
    - `setMarkers(arr)`:
      ```ts
      const pack = getPack<{ markers?: RawMarker[] }>();
      if (pack) pack.markers = arr;
      ```
    - `addLines()`: forwards to `getGlobal<() => void>("addLines")`
      if it is a function.
  - `createInvertMarkerLocksTool(runtime?)` returning a `Tool` named
    `invert_marker_locks`.
  - `invertMarkerLocksTool` — default-runtime instance.

  **Tool execute flow:**
  1. ```ts
     let markers: RawMarker[] | undefined;
     try {
       markers = runtime.getMarkers();
     } catch (err) {
       return errorResult(err instanceof Error ? err.message : String(err));
     }
     ```
  2. ```ts
     if (!Array.isArray(markers)) {
       return errorResult(
         "window.pack.markers is not available; the map hasn't finished loading.",
       );
     }
     ```
  3. ```ts
     const next = markers.map((m) => ({ ...m, lock: !m.lock }));
     ```
  4. ```ts
     try {
       runtime.setMarkers(next);
     } catch (err) {
       return errorResult(err instanceof Error ? err.message : String(err));
     }
     ```
  5. ```ts
     if (typeof runtime.addLines === "function") {
       try {
         runtime.addLines();
       } catch {
         // Best-effort.
       }
     }
     ```
  6. ```ts
     const total = next.length;
     let nowLocked = 0;
     for (const m of next) {
       if (m.lock === true) nowLocked++;
     }
     const nowUnlocked = total - nowLocked;
     return okResult({ total, now_locked: nowLocked, now_unlocked: nowUnlocked });
     ```

- **NEW** `src/ai/tools/invert-marker-locks.test.ts` — Vitest spec
  (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { invertMarkerLocksTool } from "./tools/invert-marker-locks";`
    in the import block, alphabetically between
    `invert-heightmap` (line 137) and `invert-marker-pins`
    (line 138). String compare: `invert-heightmap` <
    `invert-marker-locks` < `invert-marker-pins` (`l` < `p`).
    Final order:
    ```ts
    import { invertHeightmapTool } from "./tools/invert-heightmap";
    import { invertMarkerLocksTool } from "./tools/invert-marker-locks";
    import { invertMarkerPinsTool } from "./tools/invert-marker-pins";
    ```
  - Add re-export block immediately after the `invert-heightmap`
    re-export, alphabetically before the `invert-marker-pins`
    re-export:
    ```ts
    export {
      createInvertMarkerLocksTool,
      defaultInvertMarkerLocksRuntime,
      type InvertMarkerLocksResult,
      type InvertMarkerLocksRuntime,
      invertMarkerLocksTool,
    } from "./tools/invert-marker-locks";
    ```
  - Add `registry.register(invertMarkerLocksTool);` immediately
    after `registry.register(setMarkerLockTool);` for topical
    grouping with the other marker lock tool (the registry list
    uses topical grouping, not alphabetic).

## Tests (Vitest)

Mirror the layout of `invert-marker-pins.test.ts` (unit + integration
describe blocks).

### `invert_marker_locks tool` (unit, runtime stubbed)

Helper builds a runtime with:
```ts
function makeRuntime(opts: {
  markers?: RawMarker[] | undefined | unknown;
  addLines?: () => void;
  setMarkers?: (arr: RawMarker[]) => void;
  getMarkersThrows?: Error;
  setMarkersThrows?: Error;
} = {}) {
  let stored: RawMarker[] | undefined;
  const setMarkers = vi.fn((arr: RawMarker[]) => {
    if (opts.setMarkersThrows) throw opts.setMarkersThrows;
    if (opts.setMarkers) opts.setMarkers(arr);
    stored = arr;
  });
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const getMarkers = vi.fn(() => {
    if (opts.getMarkersThrows) throw opts.getMarkersThrows;
    return opts.markers as RawMarker[] | undefined;
  });
  return {
    runtime: { getMarkers, setMarkers, addLines },
    getMarkers,
    setMarkers,
    addLines,
    getStored: () => stored,
  };
}
```

1. **Happy path (mixed): 3 markers (lock=true, lock=false,
   lock=undefined) → after: lock=false, lock=true, lock=true.**
   - Markers: `[{ i: 1, lock: true }, { i: 2, lock: false }, { i: 3 }]`.
   - Execute `{}`.
   - Assertions:
     - `result.isError` falsy.
     - Body: `{ ok: true, total: 3, now_locked: 2, now_unlocked: 1 }`.
       (Marker 1 was true → now false; Marker 2 was false → now true;
       Marker 3 was undefined → now true since `!undefined === true`.)
     - `setMarkers.mock.calls.length === 1`.
     - `getStored()![0].lock === false`.
     - `getStored()![1].lock === true`.
     - `getStored()![2].lock === true`.

2. **All locked → all unlocked.**
   - Markers: `[{ i: 1, lock: true }, { i: 2, lock: true }, { i: 3, lock: true }]`.
   - Execute `{}`.
   - Body: `{ ok: true, total: 3, now_locked: 0, now_unlocked: 3 }`.
   - Each new marker: `marker.lock === false`.

3. **All unlocked (mixed undefined and false) → all locked.**
   - Markers: `[{ i: 1 }, { i: 2, lock: false }, { i: 3 }]`.
   - Execute `{}`.
   - Body: `{ ok: true, total: 3, now_locked: 3, now_unlocked: 0 }`.
   - Each new marker: `marker.lock === true`. **Load-bearing**:
     verifies `!undefined === true` semantics for the unlock-undefined
     case.

4. **REASSIGNMENT (LOAD-BEARING).**
   - `markers = [{ i: 1, lock: true }, { i: 2 }]`.
   - `const before = markers;`
   - `const { runtime, setMarkers, getStored } = makeRuntime({ markers });`
   - Execute `{}`.
   - Assertions:
     - `getStored() !== before` — the runtime received a NEW array
       reference (different identity from the input).
     - `setMarkers.mock.calls[0][0] !== before` — argument passed to
       setMarkers is NOT the original array.

5. **Cloned-not-mutated (LOAD-BEARING).**
   - Capture original marker references:
     `const m1 = { i: 1, lock: true }, m2 = { i: 2 };`
   - `markers = [m1, m2];`
   - Execute `{}`.
   - Assertions:
     - `m1.lock === true` — original marker object UNCHANGED.
     - `m2.lock === undefined` — original marker object UNCHANGED
       (the `lock` field was never set on `m2`, so it should remain
       absent / undefined).
     - `("lock" in m2) === false` — defensive: spread doesn't add
       fields back to the original.
     - `getStored()![0] !== m1` — new clone, not the original
       reference.
     - `getStored()![1] !== m2` — same.

6. **Other fields preserved on each new clone.**
   - Marker:
     `{ i: 7, type: "monster", icon: "?", x: 100, y: 200, cell: 42, dx: 1, dy: 2, px: 3, size: 16, pin: "bubble", fill: "#fff", stroke: "#000", pinned: true, lock: false, removed: false }`.
   - After execute, `getStored()![0]` deep-equals the same object
     except `lock: true`. Verify each named field individually.

7. **addLines best-effort: not provided → no error.**
   - Markers: `[{ i: 1 }]`. No `addLines` on opts.
   - Body still ok.

8. **addLines throws → swallowed; result still ok; reassignment
   still happens.**
   - Markers: `[{ i: 1 }]`.
   - `addLines: () => { throw new Error("ui!") }`.
   - Body still ok; `getStored()` is the new array; `getStored()[0].lock === true`.

9. **Empty markers array → all zeros, still reassigns to a NEW
   empty array (LOAD-BEARING).**
   - Markers: `[]`. `const before = markers;`.
   - Body: `{ ok: true, total: 0, now_locked: 0, now_unlocked: 0 }`.
   - `setMarkers` was called once.
   - `getStored() !== before` (still a fresh array).
   - `getStored()` is an array of length 0.

10. **Missing `pack.markers` → exact error; setMarkers NOT called.**
    - `makeRuntime({ markers: undefined })`.
    - `result.isError === true`.
    - Body `error` is exactly
      `"window.pack.markers is not available; the map hasn't finished loading."`.
    - `setMarkers.mock.calls.length === 0`.
    - `addLines` (if provided) NOT called.

11. **Non-array `pack.markers` → same error.**
    - `makeRuntime({ markers: "oops" as unknown as RawMarker[] })`.
    - Same exact error string.

12. **`getMarkers()` throws → error propagated.**
    - `makeRuntime({ getMarkersThrows: new Error("boom") })`.
    - `result.isError === true`; body `error` matches `/boom/`.
    - `setMarkers` NOT called.

13. **`setMarkers()` throws → error propagated.**
    - `makeRuntime({ markers: [{ i: 1 }], setMarkersThrows: new Error("setfail") })`.
    - `result.isError === true`; body `error` matches `/setfail/`.

14. **Tool name + schema + registry round-trip.**
    - `expect(invertMarkerLocksTool.name).toBe("invert_marker_locks");`
    - `expect(invertMarkerLocksTool.input_schema).toEqual({ type: "object", properties: {} });`
    - Build a fresh `ToolRegistry`, register, assert
      `reg.list().map(t => t.name).includes("invert_marker_locks")`.

15. **Ignores extraneous input.**
    - Execute `{ bogus: "x", count: 7 }`. Result still ok.

16. **Tolerates null/undefined input.**
    - `tool.execute(null)` and `tool.execute(undefined)` both ok.

### `defaultInvertMarkerLocksRuntime (integration)`

Save/restore `globalThis.pack` and `globalThis.addLines` per test.

17. **End-to-end: 3 markers (lock=true, lock=false, undefined) →
    new array on `pack.markers`, addLines called once.**
    - `markers = [{ i: 1, lock: true }, { i: 2, lock: false }, { i: 3 }]`.
    - `globalThis.pack = { markers }`.
    - `globalThis.addLines = vi.fn()`.
    - `const before = markers;`
    - Execute.
    - Assertions:
      - `result.isError` falsy.
      - Body: `{ ok: true, total: 3, now_locked: 2, now_unlocked: 1 }`.
      - `(globalThis as { pack: { markers: RawMarker[] } }).pack.markers !== before` — REASSIGNMENT.
      - `pack.markers[0].lock === false`, `pack.markers[1].lock === true`, `pack.markers[2].lock === true`.
      - Originals unchanged: `before[0].lock === true`, `before[1].lock === false`, `("lock" in before[2]) === false`.
      - `addLines.mock.calls.length === 1`.

18. **Integration: empty markers array → reassigns to a fresh empty
    array.**
    - `globalThis.pack = { markers: [] }`.
    - `const before = pack.markers;`
    - Execute.
    - Body all zeros.
    - `pack.markers !== before` (fresh empty array).

19. **Integration: missing pack → exact error, no addLines call.**
    - `globalThis.pack = undefined`.
    - `globalThis.addLines = vi.fn()`.
    - Result `isError: true`; error matches
      `/window\.pack\.markers is not available/`.
    - `addLines` NOT called.

20. **Integration: pack.markers not an array → same error.**
    - `globalThis.pack = { markers: "nope" }`.
    - Same error wording.

21. **Integration: addLines global missing → no error.**
    - `globalThis.pack = { markers: [{ i: 1 }] }`.
    - `globalThis.addLines = undefined`.
    - Body still ok; `pack.markers[0].lock === true`.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings,
  0 info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case and the prompt's
mandatory checks:

- **REASSIGNMENT identity test is present.** Test §4 captures
  `before = markers` and asserts `getStored() !== before` AND
  `setMarkers.mock.calls[0][0] !== before`. Test §17 (integration)
  captures `before = markers` and asserts
  `pack.markers !== before`. Test §9 verifies that even an empty
  array gets a fresh new identity. **A regression to in-place
  mutation would fail these.**
- **Cloned-not-mutated test is present.** Test §5 captures
  `m1` and `m2` references separately, then asserts that after
  the call: `m1.lock === true` (unchanged), `m2.lock === undefined`
  (unchanged), `("lock" in m2) === false` (defensive),
  AND `getStored()[0] !== m1`, `getStored()[1] !== m2` (the new
  array contains DIFFERENT object references). Test §17 verifies
  the same in the integration block via the captured `before`
  array. **A regression that mutated the originals would fail
  these.**
- **`!undefined === true` semantics tested.** Test §1 includes a
  marker with no `lock` field and asserts the new value is `true`.
  Test §3 has multiple markers without `lock` and asserts they all
  become `true`. Test §17 (integration) does the same for
  `before[2]`. **A regression to e.g. `lock: !!m.lock ? false : true`
  on a defined marker would still pass; but a regression that
  treated `undefined` as truthy would fail.** Test §3 is the
  strongest guarantee here.
- **Use case fidelity.** Mirrors `invertLock` exactly:
  `pack.markers = pack.markers.map(m => ({ ...m, lock: !m.lock }))`,
  followed by `addLines()`. We do NOT add a `drawMarkers()` call —
  the legacy doesn't either, presumably because lock state has no
  visual representation in the marker layer (only in the overview
  list). Iteration order is preserved (it's `.map()`, like the
  legacy).
- **`removed` markers iterated, not skipped.** The legacy
  `pack.markers.map(...)` does not filter on `removed`. We don't
  either. Documented in "Critical implementation note". (No
  dedicated test for this — it would be redundant with §3 since
  `.map()` on every marker is the only sensible interpretation of
  the spec.)
- **Best-effort `addLines`.** Tests §7 (missing) and §8 (throws)
  cover the two failure modes. Test §10 verifies `addLines` is NOT
  called when validation fails — the order of operations matters
  (no UI refresh on a no-op).
- **Error wording is exact.** The error string
  `"window.pack.markers is not available; the map hasn't finished loading."`
  is asserted as an exact match in tests §10/§11 (unit) and
  matches a regex in §19/§20 (integration). Wording matches
  `invert_marker_pins` and `remove_all_markers` for consistency
  across the marker family.
- **Tool schema.** `properties: {}` and no `required` field.
  Test §14 asserts the exact shape.
- **Registry slot.** Topical grouping: immediately after
  `registry.register(setMarkerLockTool);`. Mirrors how the
  `invert_marker_pins` registration sits next to
  `setMarkerPinnedTool` (both pin-related).
- **Re-export block.** Mirrors the `invert-marker-pins` shape with
  one fewer member (no `setMarkerGroupPinned` analogue). Biome
  will normalize the alphabetic order — confirm post-lint.
- **Difference from `invert_marker_pins` documented.**
  `invert_marker_pins` mutates IN PLACE and uses `delete` for the
  "off" path. `invert_marker_locks` REASSIGNS and uses plain
  boolean (so off-state is `lock: false`, not `delete marker.lock`).
  This is the legacy behaviour for both — we match each one
  faithfully even though it's an inconsistency in the legacy
  surface.

## Corrections (added during step 5 review)

Re-read both files against the prompt's three mandatory checks:

- **REASSIGNMENT identity test** — present (test §4 unit, §17
  integration, §18 integration empty-array). No correction.
- **Cloned-not-mutated test** — present (test §5 unit, §17
  integration). No correction.
- **`!undefined === true` semantics** — present (test §1 includes
  one undefined marker, test §3 has all undefined/false markers,
  test §17 covers the same in integration). No correction.

One small enhancement folded in: test §6 explicitly verifies that
all OTHER fields (icon, type, x, y, cell, dx, dy, px, size, pin,
fill, stroke, pinned, removed) are preserved on the cloned marker.
A regression that did `{ lock: !m.lock }` instead of
`{ ...m, lock: !m.lock }` would drop every other field. Since the
spec calls out "all other fields preserved", §6 makes the contract
explicit and load-bearing.

A second enhancement: test §13 explicitly tests that a
`setMarkers` failure propagates. The legacy code doesn't have an
analogous failure mode (assignment to a property can't fail in JS
without a getter trap), but our runtime abstraction can throw,
and the tool propagates the error consistently with how
`remove_all_markers` handles `setMarkers` failures.
