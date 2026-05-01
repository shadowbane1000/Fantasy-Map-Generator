# Tasks 362 — `set_cell_state` AI chat tool

## Implementation

- [ ] Create `src/ai/tools/set-cell-state.ts`:
  - [ ] Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
        `RawBurg`, `RawState` from `./_shared`; `Tool`, `ToolResult`
        from `./index`.
  - [ ] Types:
    - [ ] `CellNumberArrayLike` —
          `ArrayLike<number> & { [i: number]: number; length: number }`.
    - [ ] `PackLike` — `{ cells?: { state?: CellNumberArrayLike;
          burg?: CellNumberArrayLike }; states?: RawState[];
          burgs?: RawBurg[] }`.
    - [ ] `CellStateRuntime` interface with:
      - `getCellStates(): CellNumberArrayLike | null;`
      - `setCellState(cell: number, state: number): void;`
      - `getStates(): RawState[] | null;`
      - `getCellBurgs(): CellNumberArrayLike | null;`
      - `getBurgs(): RawBurg[] | null;`
      - `setBurgState(burgId: number, state: number): void;`
      - `drawStates(): void;`  // best-effort
  - [ ] `defaultCellStateRuntime`:
    - [ ] `getCellStates()`: read
          `getPack<PackLike>()?.cells?.state`. Return null if missing
          or `length` is not a number.
    - [ ] `setCellState(cell, state)`: re-read
          `getPack<PackLike>()?.cells?.state`. If missing → throw
          `"window.pack.cells.state is not available; the map hasn't finished loading."`.
          Write `arr[cell] = state` IN PLACE.
    - [ ] `getStates()`: read `getPack<PackLike>()?.states`. Return
          null if not an array.
    - [ ] `getCellBurgs()`: read `getPack<PackLike>()?.cells?.burg`.
          Return null if missing or `length` is not a number.
    - [ ] `getBurgs()`: read `getPack<PackLike>()?.burgs`. Return null
          if not an array.
    - [ ] `setBurgState(burgId, state)`: re-read
          `getPack<PackLike>()?.burgs`. If missing → throw
          `"window.pack.burgs is not available; the map hasn't finished loading."`.
          Lookup `burg = burgs[burgId]`. If present, set
          `burg.state = state` (in-place). If absent, no-op (the
          execute() flow already guards against this and reports
          burg_previous_state=null).
    - [ ] `drawStates()`: read `getGlobal<() => void>("drawStates")`;
          if function, call inside `try { ... } catch {}`. Otherwise
          no-op.
  - [ ] Validation helper `validateNonNegativeInteger(name, raw): number | string`:
    - Returns the number on success, the error string on failure.
    - Returns `"${name} must be a non-negative integer."` for any
      non-number / non-finite / non-integer / negative input.
    - Used for both `cell` and `state` so error messages match
      verbatim spec.
  - [ ] `createSetCellStateTool(runtime = defaultCellStateRuntime)`:
    - [ ] `name = "set_cell_state"`.
    - [ ] `description`: explain it sets `pack.cells.state[cell]` for
          a single cell, mirroring the per-cell write inside
          `applyStatesManualAssignent` in the States Editor's Manual
          mode. If the cell holds a burg, also updates that
          `burg.state` to keep them consistent (otherwise legend /
          diplomacy / state summary bugs). Best-effort calls
          `drawStates()`. Atomic — does NOT trigger
          `recalculate_states`, `States.getPoles()`,
          `adjustProvinces`, `drawBorders`, `drawProvinces` or
          `drawStateLabels`. Mention `state: 0` (Neutrals) is allowed.
          Peer to `set_cell_biome` / `set_cell_culture` /
          `set_cell_religion` / `set_cell_height`.
    - [ ] `input_schema`:
          ```jsonc
          {
            type: "object",
            properties: {
              cell:  { type: "integer", minimum: 0, description: "Cell index in pack.cells (0-based)." },
              state: { type: "integer", minimum: 0, description: "State id (0 = Neutrals)." },
            },
            required: ["cell", "state"],
          }
          ```
    - [ ] `execute(rawInput)`:
      - [ ] Coerce input as `{ cell?: unknown; state?: unknown }`.
      - [ ] Validate `cell` via helper → on string return
            errorResult.
      - [ ] Validate `state` via helper → on string return
            errorResult.
      - [ ] Call `runtime.getCellStates()`; null → errorResult
            `"window.pack.cells.state is not available; the map hasn't finished loading."`.
      - [ ] Call `runtime.getStates()`; null → errorResult
            `"window.pack.states is not available; the map hasn't finished loading."`.
      - [ ] Call `runtime.getCellBurgs()`; null → errorResult
            `"window.pack.cells.burg is not available; the map hasn't finished loading."`.
      - [ ] Call `runtime.getBurgs()`; null → errorResult
            `"window.pack.burgs is not available; the map hasn't finished loading."`.
      - [ ] If `cell >= cellStates.length` → errorResult
            `\`cell ${cell} is out of range (max ${cellStates.length - 1}).\``.
      - [ ] If `state >= states.length` → errorResult
            `\`state ${state} is not a valid state id (max ${states.length - 1}).\``.
      - [ ] Lookup `stateEntry = states[state]`. If `!stateEntry` OR
            `stateEntry.removed === true` → errorResult
            `\`State ${state} has been removed.\``.
      - [ ] Capture `previous = cellStates[cell]` (number).
      - [ ] Lookup `previous_state_name = states[previous]?.name ?? ""`
            (defensive guard for out-of-range previous values).
      - [ ] Lookup `state_name = stateEntry.name ?? ""`.
      - [ ] Lookup `burgIdRaw = cellBurgs[cell]`. If
            `burgIdRaw > 0`:
        - Capture `burgEntry = burgs[burgIdRaw]`.
        - `burg_id = burgIdRaw`.
        - `burg_name = burgEntry?.name ?? ""`.
        - `burg_previous_state = (burgEntry && typeof burgEntry.state === "number") ? burgEntry.state : null`.
        - Else (`burgIdRaw === 0` OR `burgIdRaw < 0`): `burg_id =
          null; burg_name = null; burg_previous_state = null`.
      - [ ] Try `runtime.setCellState(cell, state)`. Catch and convert
            to `errorResult(err.message)`.
      - [ ] If `burg_id !== null` AND `burgEntry` is present, try
            `runtime.setBurgState(burg_id, state)` inside try/catch;
            catch → errorResult with the message (since the cell
            mutation already happened, document via the result). To
            avoid an awkward partial state, we still propagate the
            error (caller can call `recalculate_states` to recover).
      - [ ] Try `runtime.drawStates()`. Catch and ignore — best-
            effort only.
      - [ ] Return:
            ```ts
            okResult({
              cell,
              previous_state: previous,
              previous_state_name,
              state,
              state_name,
              burg: burg_id,
              burg_name,
              burg_previous_state,
            });
            ```
  - [ ] Export `setCellStateTool = createSetCellStateTool()`.

- [ ] Create `src/ai/tools/set-cell-state.test.ts`:
  - [ ] Imports: `afterEach, beforeEach, describe, expect, it, vi`
        from "vitest"; `RawBurg`, `RawState` from `./_shared`; tool
        factory plus default runtime and registry.
  - [ ] `DEFAULT_STATES` fixture (~6 entries: index 0 = "Neutrals"
        placeholder, then 5 named states like "Valoria", "Aragorn",
        "Mistmark", "Highvale", "Ironholm").
  - [ ] `DEFAULT_BURGS` fixture (~3 burgs with id 1, 2, 3, names like
        "Bree", "Eastport", "Stonewall"; each has a `state` field).
  - [ ] `makeRuntime(opts?)` helper — returns
        `{ runtime, cellStates, cellBurgs, states, burgs,
          setCellState, setBurgState, drawStates,
          getCellStates, getStates, getCellBurgs, getBurgs }`.
        Defaults: `cellStates = new Uint16Array([0,2,2,3,4,5,0,2])`,
        `cellBurgs = new Uint8Array([0,0,0,1,0,0,0,0])` (burg 1 sits
        in cell 3), `states = DEFAULT_STATES`, `burgs = [<burg-0
        placeholder>, ...DEFAULT_BURGS]` (slot 0 reserved as in real
        pack — set state to 0). Allow each callback to be
        overridden.
  - [ ] **Stub-runtime suite (tests 1–27):**
    - [ ] Test 1: happy path, no burg in cell — `cellStates[7] = 2`,
          `cellBurgs[7] = 0`; call with `cell: 7, state: 5` →
          success; `setCellState` called with `(7, 5)`;
          `setBurgState` NOT called; result body:
          `previous_state: 2, previous_state_name: "Aragorn",
            state: 5, state_name: "Ironholm",
            burg: null, burg_name: null, burg_previous_state: null`.
    - [ ] Test 2: happy path, burg in cell — set up `cellStates[3] =
          2`, `cellBurgs[3] = 1`, `burgs[1].state = 2`. Call
          `cell: 3, state: 5` → success;
          `setCellState(3, 5)`; `setBurgState(1, 5)` called once;
          result body: `cell:3, previous_state:2, state:5,
          burg: 1, burg_name: "Bree", burg_previous_state: 2`.
    - [ ] Test 3: state=0 (Neutrals) accepted — cell with state=2 →
          set to state=0; success; result `state: 0,
          state_name: "Neutrals"`.
    - [ ] Test 4: same-state no-op — cell with state=2 → set to
          state=2; success; setCellState called once with `(_, 2)`;
          previous_state=state=2.
    - [ ] Test 5: previous_state captured BEFORE mutation — stub
          `setCellState` impl that reads cellStates[cell] before
          writing; assert returned previous_state matches the pre-
          write value AND the array reflects the new value.
    - [ ] Test 6: burg_previous_state captured BEFORE mutation — set
          up burg-in-cell scenario; pass a `setBurgState` impl that
          mutates the burg.state; assert returned burg_previous_state
          is the pre-write value AND `burgs[id].state` ends at the
          new value.
    - [ ] Test 7: state_name lookup from pack.states — pass custom
          states array with distinct names; verify
          previous_state_name and state_name match the fixture.
    - [ ] Test 8: defensive previous_state_name="" — `cellStates[0]
          = 99` (stale), states.length=3; call cell=0 state=1 →
          success; previous_state=99, previous_state_name="".
    - [ ] Test 9: drawStates called when present — `vi.fn`; assert
          called once after a happy-path call.
    - [ ] Test 10: drawStates being a no-op → no error.
    - [ ] Test 11: drawStates throwing → no error; data already
          mutated.
    - [ ] Test 12: rejects missing cell — `[undefined, null]`.
    - [ ] Test 13: rejects missing state — same.
    - [ ] Test 14: rejects non-numeric cell — `["1", true, {}, NaN,
          ±Infinity]`.
    - [ ] Test 15: rejects non-integer cell — `[1.5, 2.1, 3.9999]`.
    - [ ] Test 16: rejects negative cell — `[-1, -100]`.
    - [ ] Test 17: rejects non-numeric state — same set.
    - [ ] Test 18: rejects non-integer state — `[1.5]`.
    - [ ] Test 19: rejects negative state — `[-1]`.
    - [ ] Test 20: cell out of range — cellStates length=8; cell=8
          → error `"cell 8 is out of range (max 7)."`. Also cell=20.
    - [ ] Test 21: state out of range — states length=6; state=6 →
          error `"state 6 is not a valid state id (max 5)."`. Also
          state=99.
    - [ ] Test 22: removed state rejected — `states[2].removed =
          true`; state=2 → error `"State 2 has been removed."`;
          setCellState NOT called.
    - [ ] Test 23: empty/null state slot rejected — `states[2] =
          null` cast; state=2 → error `"State 2 has been removed."`;
          setCellState NOT called.
    - [ ] Test 24: missing pack.cells.state → error verbatim.
    - [ ] Test 25: missing pack.states → error verbatim.
    - [ ] Test 26: missing pack.cells.burg → error verbatim.
    - [ ] Test 27: missing pack.burgs → error verbatim.
  - [ ] **Stub-runtime suite continued (tests 28–34):**
    - [ ] Test 28: typed-array mutation in-place — runtime's
          `getCellStates` returns the same `Uint16Array`; setCellState
          impl does `arr[cell] = state` into THAT array; after the
          call, assert same array reference and `arr[cell] === state`.
          Also assert `cellBurgs` is referentially unchanged and
          element-wise unchanged.
    - [ ] Test 29: burg-id 0 means no burg — `cellBurgs[cell] = 0`;
          tool succeeds; `setBurgState` NOT called; result has
          `burg: null`.
    - [ ] Test 30: defensive — burg slot missing — `cellBurgs[cell]
          = 7` but `burgs[7] = undefined`; tool succeeds; setCellState
          IS called; setBurgState NOT called; result has `burg: 7,
          burg_name: "", burg_previous_state: null`.
    - [ ] Test 31: runtime errors propagate — `setCellState` throws
          `new Error("custom write failure")` → result `isError`
          with the message.
    - [ ] Test 32: registry round-trip — fresh `ToolRegistry`,
          register tool with stub runtime; dispatch via
          `registry.run("set_cell_state", { cell: 0, state: 0 })`;
          assert success and stub called.
    - [ ] Test 33: tool shape sanity — `name === "set_cell_state"`,
          `input_schema.required === ["cell", "state"]`.
    - [ ] Test 34: setBurgState runtime error propagates — burg-in-
          cell scenario; setBurgState impl throws
          `new Error("burg write failure")`; tool returns
          `isError` with the message; setCellState had already been
          called.
  - [ ] **Default-runtime integration suite (tests 35–47):**
    - [ ] `globalsRef` typed cast for globalThis with `pack`,
          `drawStates`; capture / restore in `beforeEach` /
          `afterEach`.
    - [ ] In `beforeEach`: install `globalThis.pack = { cells:
          { state: new Uint16Array([0,2,2,3,4,5,0,2]),
            burg: new Uint8Array([0,0,0,1,0,0,0,0]) },
          states: [...DEFAULT_STATES],
          burgs: [<burg-0 placeholder>, ...DEFAULT_BURGS] }`.
          Clear drawStates.
    - [ ] Test 35: default runtime mutates pack.cells.state in place
          — capture array reference; tool with `cell: 2, state: 4` →
          success; reference preserved; `pack.cells.state[2] === 4`.
    - [ ] Test 36: default runtime captures previous_state BEFORE
          mutation — same fixture; result body has
          `previous_state: 2, previous_state_name: "Aragorn",
          state: 4, state_name: "Highvale"`.
    - [ ] Test 37: default runtime updates burg.state when cell holds
          a burg — `cellBurgs[3] = 1`, `burgs[1].state = 2`;
          call `cell: 3, state: 5` → success;
          `pack.cells.state[3] === 5` AND `pack.burgs[1].state === 5`;
          result has `burg: 1, burg_name: "Bree",
          burg_previous_state: 2`.
    - [ ] Test 38: default runtime no-burg case does not mutate any
          burg — `cellBurgs[7] = 0`; record snapshot of all
          `burgs[i].state`; tool with `cell: 7, state: 5` → success;
          all burg states unchanged; result has `burg: null`.
    - [ ] Test 39: default runtime same-state no-op — set
          `cell: 2, state: 2` (current value) → success;
          previous_state=state=2.
    - [ ] Test 40: default runtime state=0 accepted — set
          `cell: 2, state: 0` → success; pack.cells.state[2]===0;
          state_name="Neutrals".
    - [ ] Test 41: default runtime missing pack.cells.state — set
          `globalThis.pack = { states: [...], cells: { burg: ... },
          burgs: [...] }` → error /pack.cells.state is not available/;
          install drawStates spy and assert NOT called.
    - [ ] Test 42: default runtime missing pack.states → error
          /pack.states is not available/.
    - [ ] Test 43: default runtime missing pack.cells.burg → error
          /pack.cells.burg is not available/.
    - [ ] Test 44: default runtime missing pack.burgs → error
          /pack.burgs is not available/.
    - [ ] Test 45: default runtime removed state rejected — mutate
          `pack.states[2].removed = true`; tool with `state: 2` →
          error `"State 2 has been removed."`; pack.cells.state
          unchanged element-wise.
    - [ ] Test 46: default runtime drawStates called when present —
          install spy; tool succeeds; spy called once.
    - [ ] Test 47: default runtime drawStates missing / throws —
          merge: (a) delete `globalThis.drawStates` → still succeeds;
          (b) install throwing spy → still succeeds and data still
          mutated. Use either two tests or one test with both
          subcases.
  - [ ] Sanity assertions on `setCellStateTool.name === "set_cell_state"`
        and `input_schema.required === ["cell", "state"]`.

- [ ] `src/ai/index.ts`:
  - [ ] Add `import { setCellStateTool } from "./tools/set-cell-state";`
        immediately AFTER the `setCellReligionTool` import line and
        BEFORE the `setCellsDensityTool` import (alphabetical:
        set-cell-religion < set-cell-state < set-cells-density).
  - [ ] Add re-export block immediately AFTER the `set-cell-religion`
        re-export and BEFORE the `set-cells-density` re-export:
        ```ts
        export {
          createSetCellStateTool,
          setCellStateTool,
        } from "./tools/set-cell-state";
        ```
  - [ ] Add `registry.register(setCellStateTool);` immediately AFTER
        `registry.register(setCellReligionTool);` and BEFORE
        `registry.register(setEntityLockTool);`.

## Verification

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — no warnings.

## Commit

- [ ] Stage:
  - `src/ai/tools/set-cell-state.ts`
  - `src/ai/tools/set-cell-state.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_362.md`
  - `aiplans/tasks_362.md`
- [ ] Commit on branch `plan-362-set-cell-state` with the
      spec-required message:
  ```
  feat(ai): add set_cell_state tool

  Implements plan 362. Adds an AI chat tool that overrides
  pack.cells.state[i] for a single cell. If a burg exists in that cell,
  its burg.state is also updated to keep them consistent — mirroring the
  per-cell write in the states editor's manual assignment mode. Atomic;
  caller must invoke recalculate_states for full propagation.
  ```
  Use a HEREDOC. Do NOT push.

## Self-review checklist (re-read before implementing)

- [ ] Plan and tasks both name file paths consistently
      (`set-cell-state.ts`, `set-cell-state.test.ts`).
- [ ] Stub-runtime tests: 34 (1–34). Integration: 13 (35–47).
      Total: 47 tests.
- [ ] Burg-in-cell side-effect tested explicitly — tests 2, 6, 37.
- [ ] No-burg-in-cell case tested (no extra mutation) — tests 1, 29,
      38.
- [ ] state=0 (Neutrals) accepted — tests 3, 40.
- [ ] Removed state rejected — tests 22, 23, 45.
- [ ] All previous values captured BEFORE mutation — tests 5
      (cell-state), 6 (burg-state), 36 (default runtime).
- [ ] Burg-id 0 → no burg mutation — test 29.
- [ ] Defensive guard for missing burg slot — test 30.
- [ ] Typed-array IN-PLACE write tested — test 28 (stub) + test 35
      (default runtime).
- [ ] state_name lookup against pack.states — test 7 + indirectly
      36/37/40.
- [ ] previous_state_name defensive "" fallback — test 8.
- [ ] Same-state no-op — tests 4, 39.
- [ ] All four required collections checked (cells.state, states,
      cells.burg, burgs) — tests 24, 25, 26, 27 + 41, 42, 43, 44.
- [ ] drawStates best-effort — tests 9/10/11 + 46/47.
- [ ] Errors-verbatim list matches plan and tests.
- [ ] Index registration alphabetically slotted between
      `setCellReligionTool` and `setEntityLockTool`.
- [ ] No `recalculate_states` invocation — keep tool atomic.
- [ ] No `States.getPoles()`, no `adjustProvinces`, no `drawBorders`,
      no `drawProvinces`, no `drawStateLabels` invocation.
