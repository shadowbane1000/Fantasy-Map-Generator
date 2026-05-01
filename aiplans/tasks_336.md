# Tasks 336: `recalculate_states` tool

Sequenced implementation tasks for plan 336.

1. **Create the tool file** `src/ai/tools/recalculate-states.ts`:
   - Imports from `./_shared`: `errorResult`, `getGlobal`, `okResult`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Define `interface RecalculateStatesRuntime { snapshotState(): number[] | null; snapshotProvince(): number[] | null; recalculate(): void; }`.
   - Define internal helper `interface PackShape { cells?: { state?: ArrayLike<number>; province?: ArrayLike<number> }; }`.
   - Implement `defaultRecalculateStatesRuntime`:
     - `snapshotState()`:
       - `const pack = getGlobal<PackShape>("pack");`
       - `const state = pack?.cells?.state;`
       - If `state` is missing or `typeof state.length !== "number"`,
         return `null`.
       - Otherwise return `Array.from(state as ArrayLike<number>)`.
     - `snapshotProvince()`:
       - Symmetric to `snapshotState()` but on `pack.cells.province`.
     - `recalculate()`:
       - `const fn = getGlobal<(must: boolean) => void>("recalculateStates");`
       - If `typeof fn !== "function"`, throw
         `new Error("window.recalculateStates is not available; the map hasn't finished loading.");`.
       - Otherwise call `fn(true)`.
   - Implement `createRecalculateStatesTool(runtime = default)`:
     - `name: "recalculate_states"`.
     - Description mentions the States Editor's Recalculate button,
       that it calls `window.recalculateStates(true)` (which re-runs
       `States.expandStates`, `Provinces.generate`,
       `Provinces.getPoles`, `States.getPoles`, then layer-toggle-aware
       redraws of states / borders / provinces / state labels).
       Mentions it returns the before/after distributions and
       `cells_state_changed` / `cells_province_changed` counts.
       Mentions takes no input.
     - `input_schema: { type: "object", properties: {} }` — no
       `required`.
     - `execute(_rawInput)`:
       1. `const previousState = runtime.snapshotState();`
       2. `const previousProvince = runtime.snapshotProvince();`
       3. If `previousState === null || previousProvince === null`, return
          `errorResult("window.pack is not available; the map hasn't finished loading.");`.
       4. `try { runtime.recalculate(); } catch (err) { return errorResult(err instanceof Error ? err.message : String(err)); }`.
       5. `const currentState = runtime.snapshotState();`
       6. `const currentProvince = runtime.snapshotProvince();`
       7. If `currentState === null || currentProvince === null`, return
          `errorResult("window.pack is not available; the map hasn't finished loading.");`
          (defensive — recalc shouldn't drop the arrays, but safe).
       8. Compute `cells_state_changed`:
          - `const len = Math.max(previousState.length, currentState.length);`
          - Walk `i = 0..len-1`; if `previousState[i] ?? -1 !== currentState[i] ?? -1`,
            increment a counter.
       9. Same for `cells_province_changed` over previousProvince /
          currentProvince.
       10. Compute histograms via local helper:
           - `function histogram(arr: number[]): Record<string, number> { const out: Record<string, number> = {}; for (const v of arr) { const k = String(v); out[k] = (out[k] ?? 0) + 1; } return out; }`.
       11. `return okResult({ cells_state_changed, cells_province_changed, previous_state_distribution: histogram(previousState), state_distribution: histogram(currentState), previous_province_distribution: histogram(previousProvince), province_distribution: histogram(currentProvince) });`.
   - Export `recalculateStatesTool = createRecalculateStatesTool();`.

2. **Create the test file** `src/ai/tools/recalculate-states.test.ts`:
   - Imports: `afterEach, beforeEach, describe, expect, it, vi` from
     `vitest`; default + factory + types from `./recalculate-states`;
     `ToolRegistry` from `./index`.
   - Helper `makeRuntime(opts)` that builds a runtime with stubbed
     `snapshotState` (sequence-based array returning) /
     `snapshotProvince` (same) / `recalculate` fns and returns the
     runtime + the spies.
     - The sequence helper should throw a clear error when called
       more times than its sequence has entries (catches bugs where
       the implementation calls `snapshotState` 3+ times by mistake).
   - `describe("recalculate_states tool", …)`:
     - **§1 Happy path — snapshots before recalc, cells_state_changed
       and cells_province_changed correct, recalc called once in
       order.**
       - `snapshotState` returns `[0, 0, 1, 1, 2, 2]` then
         `[0, 1, 1, 2, 2, 2]` (indices 1 and 3 differ).
       - `snapshotProvince` returns `[10, 10, 11, 11, 12, 12]` then
         `[10, 10, 11, 12, 12, 12]` (only index 3 differs).
       - `recalculate` is `vi.fn` (no-op).
       - Execute. Assertions:
         - `recalculate` called exactly once.
         - `snapshotState` called exactly twice.
         - `snapshotProvince` called exactly twice.
         - Call ORDER via `mock.invocationCallOrder`:
           BOTH snapshotState[0] AND snapshotProvince[0] < recalculate[0] < BOTH snapshotState[1] AND snapshotProvince[1].
         - Result equals
           `{ ok: true, cells_state_changed: 2, cells_province_changed: 1, previous_state_distribution: { "0": 2, "1": 2, "2": 2 }, state_distribution: { "0": 1, "1": 2, "2": 3 }, previous_province_distribution: { "10": 2, "11": 2, "12": 2 }, province_distribution: { "10": 2, "11": 1, "12": 3 } }`.
     - **§2 previous_*_distribution captured BEFORE recalc**
       (regression test for the prompt's mandatory check).
       - `snapshotState` returns `[0, 0, 1]` then `[1, 1, 1]`.
       - `snapshotProvince` returns `[5, 5, 6]` then `[6, 6, 6]`.
       - Execute. Result's `previous_state_distribution` MUST equal
         `{ "0": 2, "1": 1 }` (BEFORE), NOT `{ "1": 3 }`.
         `state_distribution` MUST equal `{ "1": 3 }`.
         Result's `previous_province_distribution` MUST equal
         `{ "5": 2, "6": 1 }` (BEFORE), NOT `{ "6": 3 }`.
         `province_distribution` MUST equal `{ "6": 3 }`.
         `cells_state_changed === 2`, `cells_province_changed === 2`.
       - Belt-and-suspenders: assert
         `parsed.previous_state_distribution` is NOT structurally
         equal to `parsed.state_distribution`, and same for
         provinces.
     - **§3 No-op recalc → cells_*_changed = 0.**
       - All four snapshots return same array (state: `[0, 0, 1, 1]`,
         province: `[5, 5, 6, 6]`).
       - Result: zero changes for both, matching distributions
         pre/post.
       - `recalculate` still called once.
     - **§4 Missing pack/cells/state → error.**
       - `snapshotState` returns `null` on first call. Province
         snapshot mock should also be set up (returning a valid array
         so the test catches "wrong field" failures cleanly).
       - Result: `isError: true`, error verbatim
         `"window.pack is not available; the map hasn't finished loading."`.
       - `recalculate` NOT called.
     - **§5 Missing pack/cells/province → error.**
       - `snapshotState` returns `[0, 1]` valid; `snapshotProvince`
         returns `null` on first call.
       - Result: `isError: true`, error verbatim
         `"window.pack is not available; the map hasn't finished loading."`.
       - `recalculate` NOT called.
     - **§6 window.recalculateStates missing → error from runtime.**
       - `recalculate` throws
         `new Error("window.recalculateStates is not available; the map hasn't finished loading.")`.
       - First snapshots return `[0, 1]` and `[5, 6]`.
       - Result: `isError: true` with that message.
       - Second snapshots NOT called (sequence helper would throw if
         called a 3rd time — test asserts no throw).
     - **§7 Runtime error inside recalculate is surfaced.**
       - `recalculate` throws `new Error("boom")`.
       - First snapshots return valid arrays.
       - Result: `isError: true` with `"boom"`.
     - **§8 Tool name + schema + registry round-trip.**
       - `tool.name === "recalculate_states"`,
         `input_schema.type === "object"`, `properties === {}`,
         `required === undefined`. Then `new ToolRegistry()`,
         `register(...)`, `list().map(t => t.name)` contains
         `"recalculate_states"`.
     - **§9 Empty-input handling.** Parametric over `{}`, `null`,
       `undefined`, `{ extra: "ignored" }` — all behave identically.
       Build a fresh runtime per iteration so the snapshot sequences
       reset.
     - **§10 Empty cells.state and cells.province → counts = 0,
       empty histograms.**
       - All four snapshots return `[]`.
       - Result: `{ ok: true, cells_state_changed: 0, cells_province_changed: 0, previous_state_distribution: {}, state_distribution: {}, previous_province_distribution: {}, province_distribution: {} }`.
   - `describe("defaultRecalculateStatesRuntime (integration)", …)`:
     - Save/restore `globalThis.pack`, `globalThis.recalculateStates`
       per test (`beforeEach` clears, `afterEach` restores).
     - **§11 End-to-end with populated globals.**
       - `globalThis.pack = { cells: { state: new Uint16Array([0, 0, 1, 1, 2]), province: new Uint16Array([10, 10, 11, 11, 12]) } }`.
       - `globalThis.recalculateStates = vi.fn(() => { (globalThis.pack as { cells: { state: Uint16Array; province: Uint16Array } }).cells.state = new Uint16Array([0, 1, 1, 2, 2]); (globalThis.pack as { cells: { state: Uint16Array; province: Uint16Array } }).cells.province = new Uint16Array([10, 10, 12, 12, 12]); });`.
       - Execute. Assertions:
         - `recalculateStates` called once.
         - `recalculateStates.mock.calls[0]?.[0] === true`.
         - Result `cells_state_changed === 2` (indices 1 and 3).
         - Result `cells_province_changed === 2` (indices 2 and 3).
         - `previous_state_distribution === { "0": 2, "1": 2, "2": 1 }`.
         - `state_distribution === { "0": 1, "1": 2, "2": 2 }`.
         - `previous_province_distribution === { "10": 2, "11": 2, "12": 1 }`.
         - `province_distribution === { "10": 2, "12": 3 }`.
           (Note: "11" should NOT be a key — the histogram only
           includes ids that appear at least once. Using
           `toEqual` enforces this.)
     - **§12 Missing recalculateStates global → error.**
       - `globalThis.recalculateStates = undefined`. Pack populated.
         Result is `isError: true` with
         `"window.recalculateStates is not available; the map hasn't finished loading."`.
     - **§13 Missing pack → error.**
       - `globalThis.pack = undefined`. Result is `isError: true` with
         `"window.pack is not available; the map hasn't finished loading."`.
     - **§14 recalculateStates called with `true` (must=true) — pinned.**
       - Variant of §11. Set up pack + recalc spy. Execute. Assert
         `recalc.mock.calls[0]?.[0] === true`. This catches a
         regression that called `recalc()` (no arg) or `recalc(false)`
         — either of which would silently no-op the legacy function
         when the user's `statesAutoChange` checkbox is unchecked.

3. **Wire into `src/ai/index.ts`**:
   - Add `import { recalculateStatesTool } from "./tools/recalculate-states";`
     immediately after the `recalculate-religions` import (currently
     line 180). Order check: `recalculate-religions` (`recalculate-r`)
     < `recalculate-states` (`recalculate-s`) <
     `regenerate-all-burg-names` (`reg`).
   - Add a re-export block immediately after the
     `recalculate-religions` re-export (currently lines 1839-1844):
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

4. **Run `npm test`.** Fix any failures. Iterate until green.

5. **Run `npx tsc --noEmit`.** Fix any type errors.

6. **Run `npm run lint 2>&1 | tail -10`.** Confirm baseline holds (0
   errors, 0 warnings, 0 info). Fix any new noise.

7. **Stage and commit** on the `plan-336-recalculate-states` branch:
   - `git add aiplans/plan_336.md aiplans/tasks_336.md src/ai/tools/recalculate-states.ts src/ai/tools/recalculate-states.test.ts src/ai/index.ts`
   - Commit message:
     ```
     feat(ai): add recalculate_states tool

     Implements plan 336. Adds an AI chat tool that calls
     recalculateStates(true) to re-run state/province expansion and refresh
     borders, mirroring the "Recalculate" button in the states editor.
     ```
   - Do NOT push. Do NOT touch any other branch / worktree.
