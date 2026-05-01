# Plan 335: `recalculate_religions` tool

## Use case

Add an AI chat tool `recalculate_religions` that re-runs the religion
expansion algorithm so cell→religion assignments match the current
religion centers / expansion / type values. Mirrors the legacy
`recalculateReligions(true)` invoked by the **Recalculate** button in
the Religions Editor (`public/modules/dynamic/editors/religions-editor.js`
line 836):

```js
function recalculateReligions(must) {
  if (!must && !religionsAutoChange.checked) return;

  Religions.recalculate();

  drawReligions();
  refreshReligionsEditor();
  drawReligionCenters();
}
```

`line 103: byId("religionsRecalculate").on("click", () => recalculateReligions(true));`

We already have many religion mutators (`set_religion_*`,
`add_religion`, `remove_religion`, etc.) but the AI cannot trigger the
recalc that propagates those edits to `pack.cells.religion`. This
plan closes that gap.

### Choice of redraw entry point

The legacy `recalculateReligions` lives **inside** the dynamic
religions-editor ES module. ES module top-level functions are
**module-scoped**, NOT attached to `window`, so a `getGlobal("recalculateReligions")`
call returns `undefined` unless the editor has been opened (and even
then only by accident — the editor never explicitly assigns it to
`window`). In practice the existing `set-religion-expansion.ts` calls
this global "best-effort" and quietly skips when missing — meaning
that tool is silently a no-op until someone opens the editor.

For this plan the recalc is the **whole point** of the tool, so we
must NOT rely on a flaky lookup. Strategy (b) from the prompt is
chosen:

1. Call `Religions.recalculate()` directly. `Religions` is exposed via
   `src/modules/religions-generator.ts` line 1168 (`window.Religions = new ReligionsModule();`)
   and the editor's `recalculateReligions` does the same call —
   bypassing the wrapper just removes a flaky lookup.
2. Call `drawReligions()` (defined as a top-level function in the
   classic-script `public/modules/ui/layers.js`, so it IS on `window`)
   — best-effort.
3. Call `drawReligionCenters()` (lives inside the dynamic
   religions-editor module, so it's only on `window` if the editor's
   bootstrap has somehow attached it; we fetch via `getGlobal` and
   skip if missing) — best-effort.
4. Skip `refreshReligionsEditor()` — pure DOM refresh of the editor
   panel, which the AI doesn't own and which is already module-scoped.

This mirrors the data-mutation half of the editor's button handler
exactly, plus the on-canvas redraws. The legacy `must` parameter
(which gates on the `religionsAutoChange` checkbox) is irrelevant to
the AI — the AI is always saying "do it now", which is the `must=true`
branch.

## Lint baseline

`npm run lint 2>&1 | tail -50` on the worktree base
(branch `plan-335-recalculate-religions`, master @ 08e69bc, working
tree clean) reports:

```
Checked 773 files in 620ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this — any new warning is a fail.

## Behavior

- The tool takes no arguments.
- Snapshot `pack.cells.religion` BEFORE the recalc as a histogram
  `previous_distribution: { [religionId: string]: count }`.
- Call `Religions.recalculate()`. This rewrites `pack.cells.religion`
  (a `Uint16Array`) in place via `expandReligions`, then calls
  `checkCenters()` to repair any extinct/displaced religion centers.
- After the data mutation, snapshot the post-recalc cells.religion
  distribution as `distribution: { [religionId: string]: count }`.
- Compute `cells_changed`: count of indices where the pre-snapshot
  and post-snapshot disagree.
- Best-effort call `drawReligions()` and `drawReligionCenters()`
  (each wrapped in try/catch — data mutation already happened).
- Return `{ ok: true, cells_changed, previous_distribution, distribution }`.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input.

### Validation

- `pack` must exist; `pack.cells` must exist with a `religion`
  property that is iterable (a `Uint16Array` in production, but the
  tool tolerates any array-like with numeric `.length` and indexable
  numbers — important for tests that inject plain arrays).
- `Religions.recalculate` must be a function on `globalThis.Religions`.
- `drawReligions` / `drawReligionCenters` are best-effort: if
  missing, skipped silently. If present but throwing, the throw is
  swallowed (data mutation already landed; the caller still gets `ok`).

### Errors (verbatim)

- `"window.pack is not available; the map hasn't finished loading."` —
  when `pack` is missing or `pack.cells.religion` is missing/not
  array-like.
- `"Religions.recalculate is not available; the map hasn't finished loading."` —
  when `Religions` is missing or `Religions.recalculate` is not a
  function.
- Runtime errors thrown by `Religions.recalculate` itself are
  surfaced via
  `errorResult(err instanceof Error ? err.message : String(err))`. No
  rollback (in-place mutation already partially landed).

### Success result

```jsonc
{
  "ok": true,
  "cells_changed": 1234,
  "previous_distribution": { "0": 4500, "1": 1234, "2": 567 },
  "distribution":          { "0": 4400, "1": 1300, "2": 601 }
}
```

`previous_distribution` is captured BEFORE `Religions.recalculate()`
runs. `distribution` is captured AFTER. `cells_changed` is the
Hamming distance between the two `cells.religion` snapshots (count
of cells whose religion id differs).

## Files

- **NEW** `src/ai/tools/recalculate-religions.ts` — the tool.
  Exports:
  - `interface RecalculateReligionsRuntime { snapshot(): { length: number; toHistogram(): Record<string, number>; equalsAt(i: number, other: { at(i: number): number }): boolean; at(i: number): number; }; recalculate(): void; redraw(): void; redrawCenters(): void; }` — actually we use a simpler shape: see runtime contract below.
  - `defaultRecalculateReligionsRuntime` — wires snapshots from
    `pack.cells.religion`, calls `getGlobal<{ recalculate?: () => void }>("Religions").recalculate()`,
    best-effort `getGlobal<() => void>("drawReligions")?.()` and
    `getGlobal<() => void>("drawReligionCenters")?.()`.
  - `createRecalculateReligionsTool(runtime?)` returning `Tool` named
    `recalculate_religions`.
  - `recalculateReligionsTool` — default-runtime instance.

  **Runtime contract (final)**:
  ```ts
  export interface RecalculateReligionsRuntime {
    /** Returns a copy of pack.cells.religion as a plain number[]. */
    snapshot(): number[] | null; // null when missing
    /** Calls Religions.recalculate(); throws Error on missing global. */
    recalculate(): void;
    /** Best-effort drawReligions() — never throws; missing is fine. */
    drawReligions(): void;
    /** Best-effort drawReligionCenters() — never throws; missing is fine. */
    drawReligionCenters(): void;
  }
  ```
  Snapshotting via plain `number[]` keeps the histogram + diff math
  trivial and gives tests an easy-to-build fake.

- **NEW** `src/ai/tools/recalculate-religions.test.ts` — Vitest spec
  (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add `import { recalculateReligionsTool } from "./tools/recalculate-religions";`
    immediately after the `randomize-states-expansion` import (line
    178). Alphabetical: `randomize-states-expansion` (`ran`) <
    `recalculate-religions` (`rec`) < `regenerate-all-burg-names`
    (`reg`).
  - Add a re-export block immediately after the
    `randomize-states-expansion` re-export (around line 1830):
    ```ts
    export {
      createRecalculateReligionsTool,
      defaultRecalculateReligionsRuntime,
      type RecalculateReligionsRuntime,
      recalculateReligionsTool,
    } from "./tools/recalculate-religions";
    ```
  - Add `registry.register(recalculateReligionsTool);` in
    `defaultToolRegistry()` adjacent to
    `registry.register(randomizeStatesExpansionTool);` (line 2992).

## Tests (Vitest)

Mirror the layout of `randomize-states-expansion.test.ts` +
`regenerate-zones.test.ts`.

### `recalculate_religions tool` (unit, runtime stubbed)

1. **Happy path — captures previous BEFORE recalc, computes
   cells_changed correctly, calls draw functions in order.**
   - `snapshot` is wired to a closure-controlled getter that returns
     two different snapshots on its first vs second call. First call
     returns `[0, 0, 1, 1, 2, 2]` (the BEFORE state). Second call
     returns `[0, 1, 1, 2, 2, 2]` (the AFTER state).
   - `recalculate` is a `vi.fn` that, when called, does NOT mutate
     anything — instead it just runs (the snapshot's two-call
     behavior simulates the data swap in a test-friendly way).
   - `drawReligions` and `drawReligionCenters` are `vi.fn`s.
   - Execute the tool. Assert:
     - `recalculate` was called exactly once.
     - `drawReligions` and `drawReligionCenters` were each called
       exactly once.
     - Call ORDER: `snapshot()` call #1 came before `recalculate`,
       which came before `snapshot()` call #2, which came before
       `drawReligions`, which came before `drawReligionCenters` (use
       `mock.invocationCallOrder`).
     - Result equals
       `{ ok: true, cells_changed: 2, previous_distribution: { "0": 2, "1": 2, "2": 2 }, distribution: { "0": 1, "1": 2, "2": 3 } }`.
       (Indices 1 and 3 differ; index 5 is `2` in both; `cells_changed = 2`.)
2. **Captures previous BEFORE recalculation runs** (regression test
   for the prompt's mandatory check).
   - The runtime's `recalculate` is a `vi.fn` that, when called,
     pushes the result of the next `snapshot()` to a captured
     `seenAtRecalcTime` array. We arrange `snapshot` to return the
     PRE state on its first call and a sentinel `[99]` on the second
     call. Inside `recalculate`, we DON'T call snapshot — we just
     verify (via call order) that the tool's pre-snapshot was taken
     before recalculate began.
   - Stronger version: assert that the value the tool USES as
     `previous_distribution` reflects the PRE state, not the POST
     state. We do this by: (a) `snapshot` returns `[0, 0, 1]` on
     first call, `[1, 1, 1]` on second call; (b) the tool's output
     `previous_distribution` is `{ "0": 2, "1": 1 }`, NOT
     `{ "1": 3 }`. This pins the "snapshot before recalc" contract.
3. **No-op recalc → cells_changed = 0.**
   - Both snapshot calls return `[0, 0, 1, 1]`. The tool returns
     `cells_changed: 0`, `previous_distribution: { "0": 2, "1": 2 }`,
     `distribution: { "0": 2, "1": 2 }`. Draw functions still
     called once each.
4. **Missing pack/cells/religion → error.**
   - `snapshot()` returns `null`. Result is `isError: true` with
     `"window.pack is not available; the map hasn't finished loading."`.
     `recalculate`, `drawReligions`, `drawReligionCenters` are NOT
     called.
5. **Missing Religions.recalculate → error.**
   - `recalculate()` throws `"Religions.recalculate is not available; the map hasn't finished loading."`.
     Result is `isError: true` with that message. `drawReligions`
     and `drawReligionCenters` are NOT called (we never reached the
     post-snapshot step).
6. **Runtime error inside recalculate is surfaced.**
   - `recalculate()` throws `"boom"`. Result is `isError: true` with
     error `"boom"`. Draw functions NOT called.
7. **drawReligions failure is swallowed (best-effort).**
   - `drawReligions()` throws `"draw exploded"`. Tool still returns
     `ok: true` with the correct `cells_changed`/distributions.
     `drawReligionCenters` IS still called (the next best-effort
     step shouldn't be skipped just because the previous one
     errored).
8. **drawReligionCenters failure is swallowed (best-effort).**
   - `drawReligionCenters()` throws `"centers exploded"`. Tool still
     returns `ok: true`.
9. **Tool name + schema + registry round-trip.**
   - `tool.name === "recalculate_religions"`.
   - `input_schema.type === "object"`, `input_schema.properties === {}`,
     `input_schema.required === undefined`.
   - Register in fresh `ToolRegistry`, list contains
     `"recalculate_religions"`.
10. **Empty-input handling.** Parametric over `{}`, `null`,
    `undefined`, `{ extra: "ignored" }` — all succeed identically.
11. **Empty cells.religion → cells_changed = 0, distributions are `{}`.**
    - Both snapshots return `[]`. Result is
      `{ ok: true, cells_changed: 0, previous_distribution: {}, distribution: {} }`.

### `defaultRecalculateReligionsRuntime (integration)`

12. **End-to-end with populated globals.**
    - Save/restore `globalThis.pack`, `globalThis.Religions`,
      `globalThis.drawReligions`, `globalThis.drawReligionCenters`
      per test.
    - Set `globalThis.pack = { cells: { religion: new Uint16Array([0, 0, 1, 1, 2]) } }`.
    - Set `globalThis.Religions = { recalculate: vi.fn(() => { (globalThis.pack as any).cells.religion = new Uint16Array([0, 1, 1, 2, 2]); }) }`.
    - Set `globalThis.drawReligions = vi.fn()`.
    - Set `globalThis.drawReligionCenters = vi.fn()`.
    - Execute the tool. Assert:
      - `Religions.recalculate` called once.
      - `drawReligions` called once.
      - `drawReligionCenters` called once.
      - Result `cells_changed === 2` (indices 1 and 3 changed).
      - `previous_distribution === { "0": 2, "1": 2, "2": 1 }`.
      - `distribution === { "0": 1, "1": 2, "2": 2 }`.
13. **Missing Religions global → error.**
    - `globalThis.Religions = undefined`. Pack populated. Result is
      `isError: true` with
      `"Religions.recalculate is not available; the map hasn't finished loading."`.
14. **Missing pack → error.**
    - `globalThis.pack = undefined`. Result is `isError: true` with
      `"window.pack is not available; the map hasn't finished loading."`.
15. **drawReligions / drawReligionCenters missing → still ok.**
    - Pack + Religions populated, but `drawReligions` and
      `drawReligionCenters` are undefined. Tool returns ok with
      correct `cells_changed`. (Best-effort means absent is fine.)

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -50` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** The legacy `recalculateReligions(true)` does
  three on-canvas things: `Religions.recalculate()`, `drawReligions()`,
  `drawReligionCenters()`, plus a panel refresh
  (`refreshReligionsEditor()`) that's pure DOM. We mirror the three
  on-canvas steps and intentionally skip the panel refresh — the AI
  doesn't own the editor panel and the panel rebuilds itself when
  re-opened from `pack.religions`.
- **Strategy (b) chosen, NOT (a).** The prompt asked us to verify
  whether `recalculateReligions` is exposed on `window`. Grep confirms
  it is **NOT** explicitly exposed in `public/main.js` — it lives
  inside the dynamically-imported religions-editor ES module, where
  top-level functions are module-scoped. So strategy (a) would only
  work if the user had previously opened the religions editor (and
  even then only by happenstance). Strategy (b) calls the underlying
  pieces directly: `window.Religions.recalculate()` (Religions IS
  exposed, see religions-generator.ts line 1168) plus best-effort
  `window.drawReligions` (top-level fn in classic-script
  layers.js — IS on window) plus best-effort
  `window.drawReligionCenters` (module-scoped — usually missing).
  This makes the tool work whether or not the editor was ever
  opened, which is the right call.
- **Captures previous BEFORE recalc.** Tests §1 and §2 are
  load-bearing for this. Test §2 in particular pins the contract by
  arranging snapshots so the difference between "captured before"
  and "captured after" is observable in the tool's output (the
  histogram math has to add up to the BEFORE shape, not the AFTER
  shape). A regression that captured `previous_distribution` after
  `recalculate` ran would fail §2.
- **Call ORDER pinned.** Test §1 uses
  `mock.invocationCallOrder` to assert the strict sequence:
  snapshot#1 < recalculate < snapshot#2 < drawReligions <
  drawReligionCenters. A regression that drew before recalc, or
  swapped the snapshot order, would fail.
- **`cells_changed` math.** Test §1 (3 changes), §3 (0 changes), §11
  (empty array, 0 changes), and §12 (integration, 2 changes) cover
  the diff. Implementation: walk both snapshots in lockstep up to
  `min(prev.length, curr.length)`, count `prev[i] !== curr[i]`. If
  lengths differ, the extra trailing cells count as changed. The
  default runtime returns `Array.from(uint16)` so lengths always
  match — but a bug-resistant impl handles the mismatch case.
- **Histogram math.** Plain `Record<string, number>` keyed by
  stringified id. JSON.parse round-trip in tests treats numeric keys
  as strings anyway, so this matches the wire format.
- **`Religions.recalculate` interface.** Verified at
  `src/modules/religions-generator.ts` line 999. Takes no args. The
  default runtime invokes via
  `getGlobal<{ recalculate?: () => void }>("Religions")?.recalculate?.()`
  with explicit `typeof` check first to surface the precise error
  message when `Religions` is present but missing the method.
- **Best-effort draw failure swallowed.** Tests §7 and §8 explicitly
  exercise `drawReligions` throwing and `drawReligionCenters`
  throwing; both must result in `ok: true` because the data
  mutation already landed. Tool wraps each draw call in its own
  try/catch (NOT a single shared try/catch — that would cause a
  drawReligions throw to skip drawReligionCenters).
- **No rollback on recalc failure.** Test §6 asserts `isError: true`
  on a recalc throw. The tool does NOT attempt to restore the
  previous `cells.religion` — the underlying `expandReligions` call
  in `recalculate()` mutates in place and may have partially
  written. Documented limitation; same shape as
  `randomize-states-expansion`.
- **Empty-input schema.** `properties: {}`, no `required` — matches
  `regenerate_diplomacy` and `randomize_states_expansion` exactly.
- **Error wording.** `"window.pack is not available; the map hasn't finished loading."`
  matches the wording used by other tools (e.g.
  `regenerate-diplomacy`'s "is not available; the map hasn't
  finished loading."). `"Religions.recalculate is not available; the map hasn't finished loading."`
  follows the same template, with the entry-point name preceding
  "is not available".
- **Alphabetical insertion.** `recalculate-religions` (`rec`) slots
  between `randomize-states-expansion` (`ran`) and
  `regenerate-all-burg-names` (`reg`) in the import block, in the
  re-export block, and in the registry registration block.
- **Default-runtime integration coverage.** Test §12 pins the
  end-to-end behavior with a real `Uint16Array` standing in for
  `pack.cells.religion`. The `Religions.recalculate` mock swaps
  `pack.cells.religion` to a fresh array, exactly as the real
  implementation does (`pack.cells.religion = newReligionIds;` at
  religions-generator.ts line 1001).
- **Distribution keys are strings.** When `pack.cells.religion` is
  a `Uint16Array`, indexing returns a `number`. The histogram uses
  `String(id)` (or `"" + id`) as the key. JSON serializes object
  keys as strings either way, so the wire format is consistent.
- **Self-check: would a "pre-snapshot is wrong" regression be
  caught?** Test §2 builds the snapshot pair so the BEFORE
  histogram (`{ "0": 2, "1": 1 }`) is structurally distinct from
  the AFTER histogram (`{ "1": 3 }`). The output's
  `previous_distribution` MUST equal the BEFORE shape — anything
  else fails the equality check. ✓

## Corrections (added during step 5 review)

Re-read both files and verified:

- **"previous_distribution captured BEFORE the recalculation runs"
  test is present.** Tests §1 and §2 in both plan and tasks. §2 in
  particular makes it impossible to silently break — the BEFORE and
  AFTER histograms have structurally different keys, so a regression
  that captured the post-snapshot first would either fail the
  `previous_distribution` equality or the `cells_changed` math.
- **Test §10 (empty-input handling) wording tightened in tasks**:
  changed the inline phrasing "Use a runtime that returns the same
  snapshots each call by resetting between iterations" to a clearer
  hint — the test should rebuild the snapshot mock between
  iterations OR construct a snapshot mock whose sequence repeats.
  Marked as a clarification; underlying contract unchanged.
- **`cells_changed` length-mismatch handling** is documented in the
  tasks file (use `Math.max(prev.length, current.length)` with `??`
  fallback to `-1`). This is a defensive case — in production
  `Religions.recalculate` always assigns a fresh `Uint16Array` of
  the same length, but defensive code costs nothing here.
- **Best-effort draws use TWO try/catches, not one shared one.** Tests
  §7 and §8 enforce this — if §7 swallowed the throw with a single
  shared try/catch wrapping both draws, then `drawReligionCenters`
  would never run and §7's "drawReligionCenters IS still called"
  assertion would fail. Tasks §1 step 6 explicitly says "each in its
  own try/catch".
- **Default-runtime methods also swallow throws internally.** This
  is belt-and-braces — the tool's own try/catch handles foreign
  runtimes; the default runtime's internal try/catch handles the
  real DOM-redraw functions which can throw deep in d3 rendering.
  Either path keeps the tool's `ok: true` contract.
