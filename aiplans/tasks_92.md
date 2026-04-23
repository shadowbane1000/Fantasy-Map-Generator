# Tasks 92 — remove_state AI tool

- [ ] Create `src/ai/tools/remove-state.ts`:
  - Imports from `./_shared`: errorResult, findEntityByRef,
    getGlobal, getNotes, getPack, okResult, parseEntityRef,
    types RawBurg, RawNote, RawProvince, RawRegiment,
    RawState.
  - Local `PackWithStateCells`:
    ```
    interface PackWithStateCells {
      cells?: {
        state?: number[];
        province?: number[];
      };
      states?: RawState[];
      provinces?: RawProvince[];
      burgs?: RawBurg[];
    }
    ```
  - Exports:
    - `RemoveStateRef { i, name, fullName, provinces:
       number[], military: RawRegiment[] }`.
    - `RemoveStateResult { reassignedBurgs,
       removedProvinces, removedRegiments, neighborsCleaned }`.
    - `RemoveStateRuntime { find, remove }`.
    - `defaultRemoveStateRuntime`:
      - find: findEntityByRef (skips removed/0). Copy
        `.provinces` and `.military` into snapshot arrays
        so we don't mutate-while-iterate.
      - remove(ref):
        - Get pack; throw if missing / states missing.
        - Walk pack.burgs: if `burg.state === ref.i &&
          !removed`, set burg.state = 0 AND if burg.capital
          then burg.capital = 0; count.
        - Cells state zero.
        - For each p in ref.provinces:
          - If pack.provinces[p] exists, replace with
            `{ i: p, removed: true }`.
          - Zero pack.cells.province entries === p.
          - Best-effort DOM removals (provinceCOA,
            provinceEmblems use[data-i=p], #province{p},
            #province-gap{p}).
          - count.
        - Walk ref.military: remove matching note
          `regiment{stateId}-{i}` from globalThis.notes;
          count.
        - Best-effort: `#army{i}` remove.
        - Walk pack.states: if other active, filter
          neighbors to drop ref.i; count changed.
        - pack.states[ref.i] = { i: ref.i, removed: true }.
        - Best-effort DOM: state{i}, state-gap{i},
          state-border{i}, stateLabel{i},
          textPath_stateLabel{i}, stateCOA{i},
          stateEmblems use[data-i].
        - unfog(`focusState${ref.i}`) best-effort.
        - drawStates / drawBorders / drawProvinces
          best-effort.
        - Return counts.
    - `createRemoveStateTool(runtime?)` and
      `removeStateTool`.
  - Tool name: `remove_state`.
  - Description: lists mutations, notes tombstone replaces
    the state object (matches UI), counts in response,
    rejects Neutrals/removed.
  - Schema: `state` (int|string required).
  - Validation:
    - parseEntityRef.
    - find returns null → error.
    - current.i <= 0 → "Cannot remove state 0 (Neutrals)."
  - Return payload: `{ i, name, fullName,
    reassignedBurgs, removedProvinces, removedRegiments,
    neighborsCleaned }`.

- [ ] Register in `src/ai/index.ts`:
  - Import after `removeProvinceTool`.
  - Barrel re-export.
  - `registry.register(removeStateTool)`.

- [ ] Write `src/ai/tools/remove-state.test.ts`:
  - Unit (stubbed runtime):
    - removes by id (verifies remove called with ref).
    - resolves by name.
    - rejects invalid refs.
    - rejects state 0.
    - rejects unknown state.
    - surfaces runtime errors.
  - `defaultRemoveStateRuntime (integration)`:
    - stubs pack:
      - cells.state = [0, 1, 2, 1, 2, 0]
      - cells.province = [0, 3, 4, 3, 4, 0]
      - states:
        {i:0, name:"Neutrals"},
        {i:1, name:"Altaria", fullName:"Kingdom of
         Altaria", provinces:[3,4], military:[{i:1}],
         neighbors:[2]},
        {i:2, name:"Brighton", provinces:[5], military:[],
         neighbors:[1]}
      - provinces:
        {i:0}, {i:1}, {i:2},
        {i:3, name:"North", state:1},
        {i:4, name:"South", state:1},
        {i:5, name:"East", state:2}
      - burgs:
        {i:0}, {i:1, state:1, capital:1},
        {i:2, state:1}, {i:3, state:2},
        {i:4, state:1, removed:true}
    - stubs `globalThis.notes = [
        {id:"regiment1-1", name:"1st Army"},
        {id:"regiment2-1", name:"Other"}
      ]`.
    - stubs draw*, unfog, document with a minimal DOM.
    - Remove state 1:
      - pack.cells.state == [0, 0, 2, 0, 2, 0].
      - pack.cells.province == [0, 3, 4, 3, 4, 0] was unchanged for cells containing 3 and 4 — wait, we ZERO cells.province entries === 3 or 4 because those provinces get tombstoned. So cells.province becomes [0, 0, 0, 0, 0, 0]. Verify that.
      - pack.provinces[3] == {i:3, removed:true} and same for 4.
      - pack.provinces[5] untouched.
      - pack.burgs[1].state == 0 AND capital == 0.
      - pack.burgs[2].state == 0.
      - pack.burgs[3].state == 2 (untouched).
      - pack.burgs[4] untouched (removed).
      - notes: regiment1-1 spliced; regiment2-1 present.
      - pack.states[2].neighbors == [] (1 removed).
      - pack.states[1] == {i:1, removed:true} (no name).
      - Counts: reassignedBurgs=2, removedProvinces=2,
        removedRegiments=1, neighborsCleaned=1.
    - rejects state 0.
    - rejects already-removed state.

- [ ] Update `README_AI.md` — row near `remove_province`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add remove_state tool`.

## Verification: tasks → plan

- All nine cascades from the plan are in
  defaultRemoveStateRuntime.remove. DOM is best-effort;
  core pack mutations are required.
- Counts match plan's success criteria.

## Verification: plan → use case

- UI runs stateRemove which does the same 9 steps. The
  tool mirrors those steps, with best-effort DOM/redraw
  where the UI's exact side-effects are environment-
  specific.
- Tombstone form matches UI: state overwrite with
  { i, removed: true }; province overwrite with
  { i: p, removed: true }.

## Verification: tests → regressions

- If burg cascade dropped or capital flag stayed, burg
  assertions fail.
- If province tombstones dropped, provinces[3]/[4]
  assertions fail.
- If cells.province/state zeroing dropped, cells
  assertions fail.
- If note splicing dropped, notes assertions fail
  (regiment1-1 still present).
- If neighbors cleanup dropped, states[2].neighbors
  assertion fails.
- If state tombstone form wrong (e.g. preserved name),
  state[1] name assertion fails.
- If counts wrong, count assertions fail.
- If state 0 protection dropped, that rejection test
  fails.
