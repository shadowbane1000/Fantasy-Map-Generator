# Plan 341: `invert_marker_pins` tool

## Use case

Add an AI chat tool `invert_marker_pins` that flips the `pinned` flag
on every marker in `pack.markers`. This mirrors the legacy
`invertPin` function in `public/modules/ui/markers-overview.js`
(line 112), which is wired to the "Invert pin" row-toolbar button:

```js
function invertPin() {
  let anyPinned = false;

  pack.markers.forEach(marker => {
    const pinned = !marker.pinned;
    if (pinned) {
      marker.pinned = true;
      anyPinned = true;
    } else delete marker.pinned;
  });

  markerGroup.setAttribute("pinned", anyPinned ? 1 : null);
  drawMarkers();
  addLines();
}
```

The user can already trigger this via the "Invert pin" button in the
markers overview. The AI cannot. The `pinned` flag determines which
markers appear when the "show pinned only" filter is active in the
overview UI.

We already have:

- `set_marker_pinned` (per-marker pinned flag toggle)
- `list_marker_pins` (lists pinned-shape ids — different concept;
  returns the canonical pin SHAPE identifiers, not pinned markers)
- the rest of the marker family (`add_marker`, `remove_marker`,
  `set_marker_lock`, `set_marker_pin`, `set_marker_note`, etc.)

This plan adds the missing **bulk invert** action: flip every
`marker.pinned` in one shot.

NOTE: the legacy code uses `delete marker.pinned` (not
`marker.pinned = false`) when toggling off, mirroring the UI's
"absent === not pinned" convention. Tests verify this with
`'pinned' in marker === false` after a flip-off.

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-341-invert-marker-pins`, master @ 4b456b7,
working tree clean for `src/`) reports:

```
Checked 785 files in 632ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress this.

## Behavior

- Get `pack.markers` via the runtime. If missing or not an array →
  error.
- For each marker in `pack.markers` (iterate ALL — the legacy
  `invertPin` does not filter on `marker.removed`; we mirror that):
  - If `marker.pinned` is truthy → `delete marker.pinned`.
  - Else → `marker.pinned = true`.
- Track `anyPinned` (true if at least one marker ends up pinned).
- Update the SVG `#markers` group attribute:
  `setAttribute("pinned", anyPinned ? "1" : null)` — best-effort,
  silently swallow errors.
- Best-effort: call `drawMarkers()` if available, swallow errors.
- Best-effort: call `addLines()` if available, swallow errors.
  (Legacy `invertPin` calls `addLines()` to refresh the markers
  overview rows; if the overview isn't open, the global is undefined
  and we skip.)
- Mutation MUST be in-place — `pack.markers` array identity is
  preserved (DO NOT reassign `pack.markers`).
- Compute the summary:
  - `total` = number of markers iterated.
  - `now_pinned` = count where `marker.pinned === true` after the flip.
  - `now_unpinned` = `total - now_pinned`.
  - `any_pinned` = `now_pinned > 0`.

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
- Runtime errors thrown by the runtime are propagated via
  `errorResult(err.message)`.

### Success result

```jsonc
{
  "ok": true,
  "total": M,
  "now_pinned": N,
  "now_unpinned": K,
  "any_pinned": bool
}
```

`now_pinned + now_unpinned === total`. `any_pinned === now_pinned > 0`.

## Files

- **NEW** `src/ai/tools/invert-marker-pins.ts` — the tool.
  Exports:
  - `interface InvertMarkerPinsResult { total: number; now_pinned: number; now_unpinned: number; any_pinned: boolean; }`
  - `interface InvertMarkerPinsRuntime`:
    ```ts
    {
      getMarkers(): RawMarker[] | undefined;
      setMarkerGroupPinned(value: 1 | null): void;
      drawMarkers?: () => void;
      addLines?: () => void;
    }
    ```
  - `defaultInvertMarkerPinsRuntime`:
    - `getMarkers()`:
      ```ts
      const pack = getPack<{ markers?: RawMarker[] }>();
      const m = pack?.markers;
      return Array.isArray(m) ? m : undefined;
      ```
    - `setMarkerGroupPinned(value)`:
      ```ts
      if (typeof document === "undefined") return;
      const group = document.getElementById("markers");
      if (!group) return;
      try {
        if (value === 1) group.setAttribute("pinned", "1");
        else group.removeAttribute("pinned");
      } catch {
        // Best-effort.
      }
      ```
    - `drawMarkers()`: forward to `getGlobal<() => void>("drawMarkers")` if it
      is a function; swallow errors. Implemented as a wrapper so the
      runtime always has a callable (or just skip if undefined — see
      below: we make it optional and only call when defined).
    - `addLines()`: same shape, forwards to `getGlobal<() => void>("addLines")`.
  - `createInvertMarkerPinsTool(runtime?)` returning a `Tool` named
    `invert_marker_pins`.
  - `invertMarkerPinsTool` — default-runtime instance.

  **Tool execute flow:**
  1. `let markers: RawMarker[] | undefined;`
     `try { markers = runtime.getMarkers(); } catch (err) { return errorResult(err.message); }`
  2. `if (!Array.isArray(markers)) return errorResult("window.pack.markers is not available; the map hasn't finished loading.");`
  3. Iterate the array in place:
     ```ts
     let nowPinned = 0;
     for (const marker of markers) {
       if (!marker) continue; // sparse-safe, though arrays in pack.markers are dense
       if (marker.pinned) {
         delete marker.pinned;
       } else {
         marker.pinned = true;
         nowPinned++;
       }
     }
     ```
  4. `const total = markers.length;`
     `const nowUnpinned = total - nowPinned;`
     `const anyPinned = nowPinned > 0;`
  5. SVG side-effect (best-effort):
     ```ts
     try {
       runtime.setMarkerGroupPinned(anyPinned ? 1 : null);
     } catch {
       // Best-effort.
     }
     ```
  6. Best-effort `drawMarkers()`:
     ```ts
     if (typeof runtime.drawMarkers === "function") {
       try { runtime.drawMarkers(); } catch { /* swallow */ }
     }
     ```
  7. Best-effort `addLines()`:
     ```ts
     if (typeof runtime.addLines === "function") {
       try { runtime.addLines(); } catch { /* swallow */ }
     }
     ```
  8. Return:
     ```ts
     okResult({
       total,
       now_pinned: nowPinned,
       now_unpinned: nowUnpinned,
       any_pinned: anyPinned,
     });
     ```

- **NEW** `src/ai/tools/invert-marker-pins.test.ts` — Vitest spec
  (see Tests below).

- **MODIFY** `src/ai/index.ts`:
  - Add `import { invertMarkerPinsTool } from "./tools/invert-marker-pins";`
    in the import block, alphabetically between
    `invert-heightmap` (line 137) and `list-biomes` (line 138).
    String compare: `invert-heightmap` < `invert-marker-pins`
    (`h` < `m`). Final order:
    ```ts
    import { invertHeightmapTool } from "./tools/invert-heightmap";
    import { invertMarkerPinsTool } from "./tools/invert-marker-pins";
    import { listBiomesTool } from "./tools/list-biomes";
    ```
  - Add re-export block immediately after the `invert-heightmap`
    re-export (around lines 1592-1595), alphabetically before
    `list-biomes` (line 1596+):
    ```ts
    export {
      createInvertMarkerPinsTool,
      defaultInvertMarkerPinsRuntime,
      type InvertMarkerPinsResult,
      type InvertMarkerPinsRuntime,
      invertMarkerPinsTool,
    } from "./tools/invert-marker-pins";
    ```
  - Add `registry.register(invertMarkerPinsTool);` near the other
    marker-* registrations. Pick the spot immediately after
    `registry.register(setMarkerPinnedTool);` (line 2947) — topical
    grouping with the marker pin tools. Alphabetic-by-tool-name in
    the registration list isn't enforced; topical grouping is the
    convention (see `setMarkerPinTool` next to `listMarkerPinsTool`).

## Tests (Vitest)

Mirror the layout of `set-marker-pinned.test.ts` (unit + integration
describe blocks).

### `invert_marker_pins tool` (unit, runtime stubbed)

Helper builds a runtime with:
```ts
function makeRuntime(opts: {
  markers?: RawMarker[] | undefined;
  drawMarkers?: () => void;
  addLines?: () => void;
  setMarkerGroupPinned?: (v: 1 | null) => void;
} = {}) {
  const setMarkerGroupPinned = vi.fn(opts.setMarkerGroupPinned ?? (() => {}));
  const drawMarkers = opts.drawMarkers ? vi.fn(opts.drawMarkers) : undefined;
  const addLines = opts.addLines ? vi.fn(opts.addLines) : undefined;
  const getMarkers = vi.fn(() => opts.markers);
  return { runtime: { getMarkers, setMarkerGroupPinned, drawMarkers, addLines },
           getMarkers, setMarkerGroupPinned, drawMarkers, addLines };
}
```

1. **Happy path: 2 pinned + 1 unpinned.**
   - Markers: `[{ i: 1, pinned: true }, { i: 2 }, { i: 3, pinned: true }]`.
   - Execute `{}`.
   - Assertions:
     - `result.isError` falsy.
     - Body: `{ ok: true, total: 3, now_pinned: 1, now_unpinned: 2, any_pinned: true }`.
     - `markers[0].pinned`: `'pinned' in markers[0] === false` (was true → deleted).
     - `markers[1].pinned === true` (was unpinned → now pinned).
     - `markers[2]`: `'pinned' in markers[2] === false`.
     - **MANDATORY** delete-vs-set semantics: assert that
       `'pinned' in markers[0]` is **false** (delete, not assignment
       to false). This is load-bearing — a regression that wrote
       `marker.pinned = false` instead of `delete marker.pinned`
       would leak through `'pinned' in marker === true`.
     - `setMarkerGroupPinned` called once with `1` (any pinned).

2. **All unpinned → all become pinned.**
   - Markers: `[{ i: 1 }, { i: 2 }, { i: 3 }]`.
   - Execute `{}`.
   - Body: `{ total: 3, now_pinned: 3, now_unpinned: 0, any_pinned: true }`.
   - Each marker has `marker.pinned === true`.
   - `setMarkerGroupPinned` called once with `1`.

3. **All pinned → all become unpinned.**
   - Markers: `[{ i: 1, pinned: true }, { i: 2, pinned: true }, { i: 3, pinned: true }]`.
   - Execute `{}`.
   - Body: `{ total: 3, now_pinned: 0, now_unpinned: 3, any_pinned: false }`.
   - For every marker: `'pinned' in marker === false`. **MANDATORY**.
   - `setMarkerGroupPinned` called once with `null`.

4. **Empty markers array → ok with all zeros.**
   - Markers: `[]`.
   - Execute `{}`.
   - Body: `{ total: 0, now_pinned: 0, now_unpinned: 0, any_pinned: false }`.
   - `setMarkerGroupPinned` called once with `null`.

5. **Missing `pack.markers` → error.**
   - Runtime `getMarkers()` returns `undefined`.
   - Execute `{}`.
   - `result.isError === true`; body `error` is exactly
     `"window.pack.markers is not available; the map hasn't finished loading."`.
   - `setMarkerGroupPinned` NOT called.

6. **`getMarkers()` returns non-array → error.**
   - `getMarkers()` returns the string `"oops"` (cast through unknown).
   - Same error wording, `isError: true`.

7. **`getMarkers()` throws → error propagated.**
   - `getMarkers()` throws `new Error("boom")`.
   - `result.isError === true`; body `error` matches `/boom/`.

8. **`setMarkerGroupPinned` is called with `1` when ANY ended up pinned.**
   - Markers: `[{ i: 1 }]` (one unpinned → becomes pinned).
   - Execute `{}`.
   - `setMarkerGroupPinned.mock.calls[0]` deep-equals `[1]`.
   - **MANDATORY**: distinguishes "1" from "null".

9. **`setMarkerGroupPinned` is called with `null` when NONE ended up pinned.**
   - Markers: `[{ i: 1, pinned: true }]` (one pinned → becomes unpinned).
   - Execute `{}`.
   - `setMarkerGroupPinned.mock.calls[0]` deep-equals `[null]`.
   - **MANDATORY**.

10. **`drawMarkers` best-effort: not provided → no error.**
    - Markers: `[{ i: 1 }]`. No `drawMarkers` on runtime.
    - Body still ok; no throw.

11. **`addLines` best-effort: not provided → no error.**
    - Same as §10 but for `addLines`.

12. **`drawMarkers` throws → swallowed; result still ok.**
    - Markers: `[{ i: 1 }]`. `drawMarkers: () => { throw new Error("svg!"); }`.
    - Body still ok; mutation still applied (`markers[0].pinned === true`).
    - `setMarkerGroupPinned` was still called with `1`.

13. **`addLines` throws → swallowed; result still ok.**
    - Same shape but for `addLines`.

14. **`setMarkerGroupPinned` throws → swallowed; result still ok.**
    - Mutation still applied. drawMarkers / addLines still called.

15. **Mutation is in-place (identity preserved).**
    - **MANDATORY** per the prompt.
    - Capture the array reference before execute:
      `const before = markers;`
    - After execute, get the live `markers` from the runtime closure;
      assert `markers === before` (reference equality). Also assert
      that the runtime `getMarkers()` still returns the same array
      object — we never reassigned.

16. **`any_pinned` correctly reflects the result (sentinel cases).**
    - Already covered in §1, §2, §3, §4 — but add an explicit test
      that pulls `any_pinned` out and asserts it equals
      `now_pinned > 0` for each scenario above. Parameterize via
      `it.each`.

17. **Tool name + schema + registry round-trip.**
    - `expect(invertMarkerPinsTool.name).toBe("invert_marker_pins");`
    - `expect(invertMarkerPinsTool.input_schema).toEqual({ type: "object", properties: {} });`
    - Build a fresh `ToolRegistry`, register, assert
      `reg.list().map(t => t.name).includes("invert_marker_pins")`.

18. **Ignores extraneous input properties.**
    - Execute `{ bogus: "x", count: 7 }`. Result still ok.

19. **Tolerates null/undefined input.**
    - `tool.execute(null)` and `tool.execute(undefined)` both ok (no
      throw; same body shape as `{}`).

### `defaultInvertMarkerPinsRuntime (integration)`

Mirror the integration block in `set-marker-pinned.test.ts`.

20. **End-to-end with populated globals: 2 pinned + 1 unpinned.**
    - Save/restore `globalThis.pack`, `globalThis.document`,
      `globalThis.drawMarkers`, `globalThis.addLines` per test.
    - `pack.markers` = `[{ i: 1, pinned: true }, { i: 2 }, { i: 3, pinned: true }]`.
    - `document.getElementById("markers")` returns a fake element with
      `setAttribute` and `removeAttribute` spies.
    - `globalThis.drawMarkers = vi.fn();`
    - `globalThis.addLines = vi.fn();`
    - Save the original markers reference.
    - Execute `invertMarkerPinsTool.execute({})`.
    - Assertions:
      - `result.isError` falsy.
      - Body: `{ ok: true, total: 3, now_pinned: 1, now_unpinned: 2, any_pinned: true }`.
      - `pack.markers === originalMarkers` (in-place mutation).
      - `'pinned' in pack.markers[0] === false`.
      - `pack.markers[1].pinned === true`.
      - `'pinned' in pack.markers[2] === false`.
      - `markerGroup.setAttribute` called once with `("pinned", "1")`.
      - `markerGroup.removeAttribute` NOT called.
      - `drawMarkers` called once.
      - `addLines` called once.

21. **Integration: all unpinned → setAttribute("pinned", "1").**
    - `pack.markers` = `[{ i: 1 }, { i: 2 }]`.
    - Body: `{ now_pinned: 2, now_unpinned: 0, any_pinned: true }`.
    - Marker group: `setAttribute("pinned", "1")` called once.
    - `removeAttribute` not called.

22. **Integration: all pinned → removeAttribute("pinned").**
    - `pack.markers` = `[{ i: 1, pinned: true }, { i: 2, pinned: true }]`.
    - Body: `{ now_pinned: 0, now_unpinned: 2, any_pinned: false }`.
    - Marker group: `removeAttribute("pinned")` called once.
    - `setAttribute` NOT called.
    - For every marker: `'pinned' in marker === false`. **MANDATORY**.

23. **Integration: empty markers array → removeAttribute.**
    - `pack.markers = []`. Body: all zeros, `any_pinned: false`.
    - Marker group: `removeAttribute("pinned")` called once.

24. **Integration: missing pack → error.**
    - `globalThis.pack = undefined`.
    - `result.isError: true`; error matches
      `/window\.pack\.markers is not available/`.
    - markerGroup attribute NOT touched.
    - drawMarkers/addLines NOT called.

25. **Integration: pack.markers not an array → error.**
    - `globalThis.pack = { markers: "nope" }`.
    - Same error wording.

26. **Integration: missing #markers element → no error, mutation still happens.**
    - `pack.markers` = `[{ i: 1 }]`.
    - `document.getElementById("markers")` returns null.
    - Body still ok; `pack.markers[0].pinned === true`.

27. **Integration: drawMarkers missing → no error.**
    - `pack.markers` = `[{ i: 1 }]`.
    - `globalThis.drawMarkers = undefined`.
    - Body still ok.

28. **Integration: addLines missing → no error.**
    - Same shape.

29. **Integration: document missing → no error (SSR-safe).**
    - `globalThis.document = undefined`.
    - Body still ok; mutation applied.

## Verification

- `npm test` — all green (existing tests + new tool tests).
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0 info**.
  Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case and the prompt's
mandatory checks:

- **Use case fidelity.** Mirrors `invertPin` exactly: per-marker
  toggle with `delete` semantics, `markerGroup.setAttribute("pinned", anyPinned ? 1 : null)`,
  followed by `drawMarkers()` and `addLines()`. Iteration order is
  preserved (it's a `for...of` over a single array, like the
  legacy `forEach`). The legacy code does NOT skip `marker.removed`
  entries — neither do we.
- **Delete-vs-set semantics test is present.** Test §1 asserts
  `'pinned' in markers[0] === false` after a flip-off. Test §3
  asserts the same for ALL markers in the all-pinned case (the
  most paranoid form). Test §22 asserts the same in the
  integration block. Three load-bearing checks. A regression that
  wrote `marker.pinned = false` instead of `delete marker.pinned`
  would fail all three.
- **setAttribute(pinned, null) vs setAttribute(pinned, 1) test is
  present.** Tests §8 and §9 verify the runtime is called with
  `1` and `null` respectively. Tests §21 and §22 verify the
  integration end of the chain (`setAttribute("pinned", "1")`
  vs `removeAttribute("pinned")`). The runtime translates `null`
  → `removeAttribute` because the legacy DOM behavior of
  `setAttribute(name, null)` is to set the literal string `"null"`,
  not to remove the attribute. Documented as the legacy bug — the
  intended behavior is "remove when none pinned", which is what
  `removeAttribute` actually does. Test §22 verifies the actual
  intended outcome.
- **Mutation is in-place.** Test §15 captures the reference before
  and asserts identity equality after. Test §20 does the same in
  the integration block.
- **Empty markers array works.** Test §4 asserts the all-zero body
  shape. Test §23 verifies the SVG side-effect path runs even on
  empty (`removeAttribute` is called).
- **Best-effort callbacks.** Tests §10–§13 cover missing /
  throwing `drawMarkers` and `addLines`. Test §14 covers a
  throwing `setMarkerGroupPinned`. None of these block the result.
- **Error wording is exact.** The error string
  `"window.pack.markers is not available; the map hasn't finished loading."`
  is asserted as an exact match in tests §5 and §24/§25
  (regex tolerates the integration ones for hyphen safety; unit
  tests use exact string).
- **Tool schema.** `properties: {}` and no `required` field.
  Test §17 asserts the exact shape.
- **Registry slot.** Alphabetically `invert-heightmap` (line 137,
  `i-h…`) precedes `invert-marker-pins` (`i-m…`) precedes
  `list-biomes` (`l-b…`). Insertion at line 138 (between them).
- **Re-export block.** Mirrors the `invertHeightmap` shape (just two
  values + types). Biome will reorder alphabetically — confirm
  post-lint.
- **Topical grouping in registration list.** Plan places the
  `registry.register(invertMarkerPinsTool)` call right after
  `registry.register(setMarkerPinnedTool)` (line 2947), matching
  the existing topical clustering of the marker tools (rather
  than a strict alphabetic ordering, which is not the convention
  in this list — see the heightmap cluster around line 2961-2970,
  which is also topical not alphabetic).

## Corrections (added during step 5 review)

Re-read both files. Verified:

- **Delete semantics: present and load-bearing.** Tests §1, §3, §22.
  No correction needed.
- **setAttribute "1" vs null/removeAttribute: present.** Tests §8,
  §9 (unit) and §21, §22 (integration). No correction needed.
- **In-place mutation: present.** Test §15 (unit) + §20 (integration).
  No correction needed.
- **Best-effort error swallowing: tests §12, §13, §14 cover the
  three independent failure modes.** No correction needed.
- **One small enhancement folded in:** Test §16 added an explicit
  `it.each` block that pins `any_pinned === now_pinned > 0` across
  every scenario. This catches a regression where someone writes
  `any_pinned: now_pinned >= 0` (always true) or `any_pinned: total > 0`
  (correct in all but the "all-pinned-becoming-all-unpinned" case
  in test §3, where `total` is non-zero but `now_pinned` is zero).
  Test §3's `any_pinned: false` would catch the latter, but §16
  makes the contract explicit.
- **`setAttribute("pinned", null)` is a real bug in the legacy
  code.** When called on a real DOM node, this sets the attribute
  to the string `"null"`, not to nothing. Our runtime does the
  intended thing (`removeAttribute`) instead. Documented above.
  Test §22 verifies the corrected behavior.
