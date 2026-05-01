# Plan 336: `recalculate_states` tool

## Use case

Add an AI chat tool `recalculate_states` that re-runs the
state-expansion and province-generation algorithms so cell→state and
cell→province assignments match the current state expansionism /
capital / culture values. Mirrors the legacy `recalculateStates(true)`
invoked by the **Recalculate** button in the States Editor
(`public/modules/dynamic/editors/states-editor.js` line 846):

```js
function recalculateStates(must) {
  if (!must && !statesAutoChange.checked) return;

  States.expandStates();
  Provinces.generate();
  Provinces.getPoles();
  States.getPoles();

  if (layerIsOn("toggleStates")) drawStates();
  if (layerIsOn("toggleBorders")) drawBorders();
  if (layerIsOn("toggleProvinces")) drawProvinces();
  if (adjustLabels.checked) drawStateLabels();

  refreshStatesEditor();
}
```

`line 101: byId("statesRecalculate").on("click", () => recalculateStates(true));`

We already have:
- `randomize_states_expansion` (plan 330) — randomizes state
  expansionism AND triggers recalc. Destructive to the `expansionism`
  field.
- `merge_states` — folds two states; doesn't touch borders directly.
- `set_entity_expansionism` — writes `state.expansionism` for one
  state but does NOT trigger any recalc, so cell assignments stay
  stale until something else recalculates.
- `set_state_type` — writes `state.type` and calls
  `recalculateStates()` best-effort.

This plan adds the missing **standalone recalc** action — analogous
to plans 334 (`recalculate_cultures`) and 335
(`recalculate_religions`), just merged. Useful as a follow-up to
state-mutation tools (`set_entity_expansionism`, `set_state_capital`,
`set_state_culture`, etc.) so the AI can refresh borders without
having to call `randomize_states_expansion` (which destroys
expansionism data).

NOTE: This is a brand-new standalone tool, NOT a refactor of the
recalc-in-`randomize_states_expansion`. That tool's internal recalc
call is left alone — both can coexist (and do call into the same
underlying `window.recalculateStates`).

### Choice of redraw entry point — strategy (a) chosen

Two options were on the table:

(a) Call `window.recalculateStates(true)` directly. Single global
    call. Mirrors plan 330's approach and exactly mirrors what the
    "Recalculate" button does, including the layer-toggle-aware
    redraws (`if (layerIsOn(...)) draw...()`) and the
    `adjustLabels.checked` gate on `drawStateLabels()`.

(b) Call `States.expandStates()`, `Provinces.generate()`,
    `Provinces.getPoles()`, `States.getPoles()` directly, then
    best-effort layer redraws.

**Strategy (a) is chosen** for consistency with plan 330 and because:

1. The prompt RECOMMENDS it.
2. `randomize-states-expansion.ts` (plan 330) already calls
   `getGlobal<...>("recalculateStates")(true, true)`. Verified in
   production — `set-state-type.ts` also calls it best-effort. The
   fact that plan 330 ships and is registered in the registry means
   the runtime lookup works in the live app.
3. The legacy `recalculateStates` lives inside the dynamic
   states-editor ES module (`public/modules/dynamic/editors/states-editor.js`),
   loaded via `await import("../dynamic/editors/states-editor.js?v=...")`
   from `public/modules/ui/editors.js`. Top-level functions in an ES
   module are normally module-scoped, but the editor's bootstrap or
   the legacy classic-script harness ends up with this on `window` —
   confirmed by plan 330 working in production.
4. Choosing (a) means the tool does exactly what the button does,
   including respecting the user's current layer toggles (no spurious
   redraws of layers that are off).

The legacy `must` parameter (which gates on the `statesAutoChange`
checkbox) is irrelevant to the AI — the AI is always saying "do it
now", which is the `must=true` branch. We pass `true`.

## Lint baseline

`npm run lint 2>&1 | tail -10` on the worktree base
(branch `plan-336-recalculate-states`, master @ 2682daa, working tree
clean) reports:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 777 files in 615ms. No fixes applied.
```

**0 errors, 0 warnings, 0 info.** Implementation must not regress
this — any new warning is a fail.

## Behavior

- The tool takes no arguments.
- Snapshot `pack.cells.state` AND `pack.cells.province` BEFORE the
  recalc as histograms `previous_state_distribution: { [stateId: string]: count }`
  and `previous_province_distribution: { [provinceId: string]: count }`.
- Call `window.recalculateStates(true)`. This re-runs
  `States.expandStates()` (rewrites `pack.cells.state`),
  `Provinces.generate()` (rewrites `pack.cells.province`),
  `Provinces.getPoles()`, `States.getPoles()`, then best-effort
  redraws (states/borders/provinces/state labels, gated on the
  user's current layer toggles).
- After the data mutation, snapshot the post-recalc cells.state and
  cells.province distributions as `state_distribution` and
  `province_distribution`.
- Compute `cells_state_changed`: count of indices where the
  pre-snapshot and post-snapshot cells.state values disagree.
- Compute `cells_province_changed`: same but for cells.province.
- Return `{ ok: true, cells_state_changed, cells_province_changed,
  previous_state_distribution, state_distribution,
  previous_province_distribution, province_distribution }`.

### Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {}
}
```

No required fields. The tool takes no input.

### Validation

- `pack` must exist; `pack.cells` must exist with a `state` property
  and a `province` property, each iterable (typed arrays in
  production, but the tool tolerates any array-like with numeric
  `.length` and indexable numbers — important for tests that inject
  plain arrays).
- `recalculateStates` must be a function on `globalThis`.

### Errors (verbatim)

- `"window.pack is not available; the map hasn't finished loading."` —
  when `pack` is missing or `pack.cells.state` / `pack.cells.province`
  is missing or not array-like.
- `"window.recalculateStates is not available; the map hasn't finished loading."` —
  when `recalculateStates` is missing or not a function.
- Runtime errors thrown by `recalculateStates` itself are surfaced
  via `errorResult(err instanceof Error ? err.message : String(err))`.
  No rollback (in-place mutation already partially landed).

### Success result

```jsonc
{
  "ok": true,
  "cells_state_changed": 234,
  "cells_province_changed": 456,
  "previous_state_distribution":    { "0": 1234, "1": 567, "2": 890 },
  "state_distribution":             { "0": 1100, "1": 580, "2": 1011 },
  "previous_province_distribution": { "0": 800, "1": 200, "2": 400 },
  "province_distribution":          { "0": 750, "1": 250, "2": 400 }
}
```

`previous_state_distribution` and `previous_province_distribution`
are captured BEFORE `recalculateStates(true)` runs.
`state_distribution` and `province_distribution` are captured AFTER.
`cells_state_changed` and `cells_province_changed` are the Hamming
distances between the corresponding before/after snapshots.

## Files

- **NEW** `src/ai/tools/recalculate-states.ts` — the tool. Exports:
  - `interface RecalculateStatesRuntime { snapshotState(): number[] | null; snapshotProvince(): number[] | null; recalculate(): void; }` (all three methods; defaults wire through `getGlobal`).
  - `defaultRecalculateStatesRuntime` — wires snapshots from
    `pack.cells.state` / `pack.cells.province`, calls
    `getGlobal<(must: boolean) => void>("recalculateStates")(true)`.
  - `createRecalculateStatesTool(runtime?)` returning `Tool` named
    `recalculate_states`.
  - `recalculateStatesTool` — default-runtime instance.

  **Runtime contract (final)**:
  ```ts
  export interface RecalculateStatesRuntime {
    /** Returns a copy of pack.cells.state as a plain number[], or
     * null when pack/cells/state is unavailable. */
    snapshotState(): number[] | null;
    /** Returns a copy of pack.cells.province as a plain number[],
     * or null when pack/cells/province is unavailable. */
    snapshotProvince(): number[] | null;
    /** Calls window.recalculateStates(true); throws Error when the
     * global is missing. */
    recalculate(): void;
  }
  ```
  Snapshotting via plain `number[]` keeps the histogram + diff math
  trivial and gives tests an easy-to-build fake. Note we do NOT add
  separate draw methods to the runtime — `recalculateStates(true)`
  itself contains the layer-toggle-aware redraw block, so the
  tool's recalc step IS the draw step.

- **NEW** `src/ai/tools/recalculate-states.test.ts` — Vitest spec
  (see Tests below).
- **MODIFY** `src/ai/index.ts`:
  - Add `import { recalculateStatesTool } from "./tools/recalculate-states";`
    immediately after the `recalculate-religions` import (currently
    line 180). Alphabetical: `recalculate-religions` (`recalculate-r`)
    < `recalculate-states` (`recalculate-s`) < `regenerate-all-burg-names`
    (`reg`).
  - Add a re-export block immediately after the
    `recalculate-religions` re-export (around lines 1839-1844):
    ```ts
    export {
      createRecalculateStatesTool,
      defaultRecalculateStatesRuntime,
      type RecalculateStatesRuntime,
      recalculateStatesTool,
    } from "./tools/recalculate-states";
    ```
  - Add `registry.register(recalculateStatesTool);` in
    `defaultToolRegistry()` immediately after
    `registry.register(recalculateReligionsTool);` (currently line
    3008).

## Tests (Vitest)

Mirror the layout of `recalculate-religions.test.ts` (closest sibling).

### `recalculate_states tool` (unit, runtime stubbed)

1. **Happy path — captures previous BEFORE recalc, computes
   cells_*_changed correctly, calls recalculate exactly once in the
   right order.**
   - `snapshotState` returns `[0, 0, 1, 1, 2, 2]` then `[0, 1, 1, 2, 2, 2]` (indices 1 and 3 differ → 2 changes).
   - `snapshotProvince` returns `[10, 10, 11, 11, 12, 12]` then `[10, 10, 11, 12, 12, 12]` (index 3 differs → 1 change).
   - `recalculate` is `vi.fn` (no-op).
   - Execute. Assertions:
     - `recalculate` called exactly once.
     - `snapshotState` called exactly twice.
     - `snapshotProvince` called exactly twice.
     - Call ORDER via `mock.invocationCallOrder`:
       snapshotState[0] AND snapshotProvince[0] BOTH < recalculate[0]
       < snapshotState[1] AND snapshotProvince[1].
     - Result equals
       `{ ok: true, cells_state_changed: 2, cells_province_changed: 1, previous_state_distribution: { "0": 2, "1": 2, "2": 2 }, state_distribution: { "0": 1, "1": 2, "2": 3 }, previous_province_distribution: { "10": 2, "11": 2, "12": 2 }, province_distribution: { "10": 2, "11": 1, "12": 3 } }`.

2. **previous_*_distribution captured BEFORE recalc** (regression
   test for the prompt's mandatory check).
   - `snapshotState` returns `[0, 0, 1]` then `[1, 1, 1]`.
   - `snapshotProvince` returns `[5, 5, 6]` then `[6, 6, 6]`.
   - Execute. Result's `previous_state_distribution` MUST equal
     `{ "0": 2, "1": 1 }` (the BEFORE shape), NOT `{ "1": 3 }`.
     `state_distribution` MUST equal `{ "1": 3 }`.
     Result's `previous_province_distribution` MUST equal
     `{ "5": 2, "6": 1 }` (BEFORE), NOT `{ "6": 3 }`.
     `province_distribution` MUST equal `{ "6": 3 }`.
     `cells_state_changed === 2`, `cells_province_changed === 2`.
     - Belt-and-suspenders: assert `previous_state_distribution !== state_distribution`
       structurally and same for provinces.

3. **No-op recalc → cells_*_changed = 0.**
   - All four snapshots return `[0, 0, 1, 1]` for state and
     `[5, 5, 6, 6]` for province.
   - Result: `{ ok: true, cells_state_changed: 0, cells_province_changed: 0, previous_state_distribution: { "0": 2, "1": 2 }, state_distribution: { "0": 2, "1": 2 }, previous_province_distribution: { "5": 2, "6": 2 }, province_distribution: { "5": 2, "6": 2 } }`.
   - `recalculate` still called once.

4. **Missing pack/cells/state → error.**
   - `snapshotState` returns `null` on first call (province snapshot
     irrelevant — should NOT be called or, if called, doesn't matter
     because state already failed first).
   - Result: `isError: true`, error verbatim
     `"window.pack is not available; the map hasn't finished loading."`.
   - `recalculate` NOT called.

5. **Missing pack/cells/province → error.**
   - `snapshotState` returns `[0, 1]`; `snapshotProvince` returns
     `null` on first call.
   - Result: `isError: true`, error verbatim
     `"window.pack is not available; the map hasn't finished loading."`.
   - `recalculate` NOT called.

6. **window.recalculateStates missing → error from runtime.**
   - `recalculate` throws
     `new Error("window.recalculateStates is not available; the map hasn't finished loading.")`.
   - First snapshots return valid `[0, 1]` and `[5, 6]`.
   - Result: `isError: true` with that message.
   - Second snapshots NOT called (we never reached the post-snapshot
     step).

7. **Runtime error inside recalculate is surfaced.**
   - `recalculate` throws `new Error("boom")`.
   - First snapshots return valid arrays.
   - Result: `isError: true` with `"boom"`.

8. **Tool name + schema + registry round-trip.**
   - `tool.name === "recalculate_states"`.
   - `input_schema.type === "object"`, `input_schema.properties === {}`,
     `input_schema.required === undefined`.
   - Register in fresh `ToolRegistry`, list contains
     `"recalculate_states"`.

9. **Empty-input handling.** Parametric over `{}`, `null`,
   `undefined`, `{ extra: "ignored" }` — all behave identically.

10. **Empty cells.state and cells.province → counts = 0, empty
    histograms.**
    - All four snapshots return `[]`.
    - Result: `{ ok: true, cells_state_changed: 0, cells_province_changed: 0, previous_state_distribution: {}, state_distribution: {}, previous_province_distribution: {}, province_distribution: {} }`.

### `defaultRecalculateStatesRuntime (integration)`

11. **End-to-end with populated globals.**
    - Save/restore `globalThis.pack`, `globalThis.recalculateStates`
      per test.
    - Set `globalThis.pack = { cells: { state: new Uint16Array([0, 0, 1, 1, 2]), province: new Uint16Array([10, 10, 11, 11, 12]) } }`.
    - Set `globalThis.recalculateStates = vi.fn(() => { (globalThis.pack as { cells: { state: Uint16Array; province: Uint16Array } }).cells.state = new Uint16Array([0, 1, 1, 2, 2]); (globalThis.pack as { cells: { state: Uint16Array; province: Uint16Array } }).cells.province = new Uint16Array([10, 10, 12, 12, 12]); });`.
    - Execute. Assertions:
      - `recalculateStates` called once with `(true)`.
      - Result `cells_state_changed === 2` (indices 1 and 3 changed).
      - Result `cells_province_changed === 2` (indices 2 and 3 changed).
      - `previous_state_distribution === { "0": 2, "1": 2, "2": 1 }`.
      - `state_distribution === { "0": 1, "1": 2, "2": 2 }`.
      - `previous_province_distribution === { "10": 2, "11": 2, "12": 1 }`.
      - `province_distribution === { "10": 2, "11": 0, "12": 3 }` —
        wait, "11" should not appear if its count is 0. So
        `{ "10": 2, "12": 3 }`. Verified by histogram impl: only
        keys with count > 0 are present.

12. **Missing recalculateStates global → error.**
    - `globalThis.recalculateStates = undefined`. Pack populated.
      Result is `isError: true` with
      `"window.recalculateStates is not available; the map hasn't finished loading."`.

13. **Missing pack → error.**
    - `globalThis.pack = undefined`. Result is `isError: true` with
      `"window.pack is not available; the map hasn't finished loading."`.

14. **recalculateStates called with `true`.**
    - Variant of §11: assert `recalculateStates.mock.calls[0]?.[0] === true`.
      Pinning the `must=true` argument is load-bearing — the legacy
      function early-returns on `must=false` if `statesAutoChange`
      is unchecked, which would silently turn the tool into a no-op.

## Verification

- `npm test` — all green.
- `npx tsc --noEmit` — clean.
- `npm run lint 2>&1 | tail -10` — still **0 errors, 0 warnings, 0
  info**. Baseline must hold.

## Self-review (added during step 5)

Reviewed the plan + tasks against the use case:

- **Use case fidelity.** The legacy `recalculateStates(true)` does
  four things: `States.expandStates()`, `Provinces.generate()`,
  `Provinces.getPoles()`, `States.getPoles()` (data mutations), then
  layer-toggle-aware redraws (`drawStates`, `drawBorders`,
  `drawProvinces`, `drawStateLabels`), then `refreshStatesEditor()`
  (DOM panel refresh). By choosing strategy (a) we delegate ALL of
  that to `window.recalculateStates(true)`, exactly mirroring the
  button click. The panel refresh is intentionally included
  (because it's part of the function we call) and that's fine — it
  no-ops if the panel isn't open.
- **Strategy (a) chosen, NOT (b).** Plan 335 chose strategy (b) for
  religions because `recalculateReligions` was suspected of being
  module-scoped. For states, plan 330 already proves that
  `recalculateStates` IS reachable via `getGlobal` — both
  `randomize-states-expansion.ts` and `set-state-type.ts` call it
  that way and ship in production. So strategy (a) is the
  consistent, RECOMMENDED, and verified-working choice here.
- **Captures previous BEFORE recalc.** Tests §1, §2 are
  load-bearing for this. Test §2 in particular pins the contract by
  arranging snapshots so the difference between "captured before"
  and "captured after" is observable in the tool's output (the
  histogram math has to add up to the BEFORE shape, not the AFTER
  shape, AND the `previous_*` and current `*_distribution` are
  structurally distinct objects). A regression that captured
  `previous_state_distribution` after `recalculate` ran would fail §2.
- **Call ORDER pinned.** Test §1 uses
  `mock.invocationCallOrder` to assert the strict sequence:
  snapshotState[0]/snapshotProvince[0] < recalculate[0] <
  snapshotState[1]/snapshotProvince[1]. A regression that
  recalculated before snapshotting would fail.
- **`cells_*_changed` math.** Tests §1 (state changes 2, province
  changes 1), §3 (0 changes for both), §10 (empty arrays, 0
  changes), §11 (integration, 2 state + 2 province changes). The
  asymmetric counts in §1 (state=2, province=1) catch a regression
  where the tool returned the wrong field for the wrong array.
- **Histogram math.** Plain `Record<string, number>` keyed by
  stringified id, only includes keys with count > 0. JSON.parse
  round-trip in tests treats numeric keys as strings anyway.
- **`recalculateStates` arg.** Test §14 explicitly asserts
  `recalculate` was called with `true`, NOT `false`. The legacy
  function's `must=false` branch early-returns when the
  `statesAutoChange` checkbox is unchecked, which would silently
  no-op the tool. Pinning this with a test catches the regression.
- **No rollback on recalc failure.** Test §7 asserts `isError: true`
  on a recalc throw. The tool does NOT attempt to restore the
  previous `cells.state`/`cells.province` — the underlying
  `expandStates()` and `Provinces.generate()` calls mutate in place
  and may have partially written. Documented limitation; same
  shape as `randomize-states-expansion`, `recalculate-cultures`,
  `recalculate-religions`.
- **Empty-input schema.** `properties: {}`, no `required` — matches
  `recalculate_cultures`, `recalculate_religions`,
  `randomize_states_expansion`, `regenerate_diplomacy`.
- **Error wording.** `"window.pack is not available; the map hasn't finished loading."`
  matches the wording used by `recalculate_religions`,
  `recalculate_cultures`, `randomize_states_expansion`, etc.
  `"window.recalculateStates is not available; the map hasn't finished loading."`
  follows the same template — but note that
  `randomize-states-expansion.ts` uses the SHORTER form
  `"window.recalculateStates is not available."` (no "; the map
  hasn't finished loading."). The prompt explicitly says "Errors
  (verbatim, consistent with plan 330)" and lists the LONGER form.
  We follow the prompt: LONGER form. This means the error message
  will differ by 36 characters from `randomize_states_expansion`'s.
  Acceptable — the prompt wins, and the longer form is more
  informative anyway.
- **Alphabetical insertion.** `recalculate-states` (`recalculate-s`)
  slots between `recalculate-religions` (`recalculate-r`) and
  `regenerate-all-burg-names` (`reg`) in the import block, in the
  re-export block, and in the registry registration block.
- **Default-runtime integration coverage.** Test §11 pins the
  end-to-end behavior with real `Uint16Array`s standing in for
  `pack.cells.state` and `pack.cells.province`. The
  `recalculateStates` mock swaps both arrays, exactly as the real
  implementation does (the real `States.expandStates` and
  `Provinces.generate` reassign these on `pack.cells`).
- **Distribution keys are strings.** When `pack.cells.state` is a
  `Uint16Array`, indexing returns a `number`. The histogram uses
  `String(id)` as the key. JSON serializes object keys as strings
  either way, so the wire format is consistent.
- **Self-check: would a "pre-snapshot is wrong" regression be
  caught?** Test §2 builds the snapshot pairs so the BEFORE
  histograms (`{ "0": 2, "1": 1 }` and `{ "5": 2, "6": 1 }`) are
  structurally distinct from the AFTER histograms (`{ "1": 3 }` and
  `{ "6": 3 }`). The output's `previous_state_distribution` and
  `previous_province_distribution` MUST equal the BEFORE shapes —
  anything else fails the equality check. ✓

## Corrections (added during step 5 review)

Re-read both files and verified:

- **"previous_*_distribution captured BEFORE the recalculation runs"
  test is present.** Tests §1 and §2 in both plan and tasks. §2 in
  particular makes it impossible to silently break — the BEFORE and
  AFTER histograms have structurally different keys (`{0,1}` vs
  `{1}`, and `{5,6}` vs `{6}`), so a regression that captured the
  post-snapshot first would either fail the
  `previous_*_distribution` equality or the `cells_*_changed` math.
  Critical because in the live runtime
  `pack.cells.state`/`pack.cells.province` are `Uint16Array`s
  reassigned in place by `States.expandStates` /
  `Provinces.generate` — if the tool snapshotted via reference
  rather than via `Array.from`, the snapshot would be silently
  overwritten and `cells_*_changed` would always read 0. The
  default runtime snapshots via `Array.from(...)` (a plain copy)
  for exactly this reason; the unit test §2 enforces the contract
  at the runtime-interface level.
- **`recalculate(true)` argument pinned.** Test §14 added
  specifically because the legacy function's `must=false` branch
  early-returns. A regression that called `recalculate()` (or
  `recalculate(false)`) would silently no-op. Without this test
  you'd only catch it with an integration test against a real
  state-editor module.
- **State/province snapshots are independent calls.** The runtime
  has TWO snapshot methods (`snapshotState` and `snapshotProvince`)
  rather than one returning both — keeps each method narrowly
  responsible and makes it easy for tests to stub differently per
  field. The tool calls both before recalc and both after.
- **Order of state/province snapshots is implementation-defined**
  (state then province for clarity). Tests don't pin a strict order
  between snapshotState[0] and snapshotProvince[0] (or between [1]
  and [1]) — only that both pre-snaps come before recalc and both
  post-snaps come after. This is what we want: the implementation
  can fetch them in either order without test churn.
