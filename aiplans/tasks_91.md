# Tasks 91 — remove_culture AI tool

- [ ] Create `src/ai/tools/remove-culture.ts`:
  - Imports from `./_shared`: errorResult, findEntityByRef,
    getPack, okResult, parseEntityRef, types RawBurg,
    RawCulture, RawState.
  - Local `PackWithCultureCells`:
    ```
    interface PackWithCultureCells {
      cells?: { culture?: number[] };
      cultures?: RawCulture[];
      states?: RawState[];
      burgs?: RawBurg[];
    }
    ```
  - Exports:
    - `RemoveCultureRef { i, name }`.
    - `RemoveCultureResult { cascadedOrigins,
       reassignedBurgs, reassignedStates }`.
    - `RemoveCultureRuntime { find, remove }`.
    - `defaultRemoveCultureRuntime`:
      - find: findEntityByRef (skips removed and id 0).
      - remove(ref):
        - Get pack; throw if missing / cultures missing.
        - Count reassignedBurgs while walking pack.burgs
          for `burg.culture === ref.i` and setting to 0.
          Skip removed burgs. Skip burg 0 (placeholder).
        - Count reassignedStates while walking pack.states:
          skip state 0 and removed, set culture to 0 when
          matches.
        - Zero pack.cells.culture entries === ref.i.
        - Tombstone: pack.cultures[ref.i].removed = true.
        - Walk other active cultures (i > 0 && !removed
          && i !== ref.i); skip if origins missing or
          doesn't include ref.i; filter out; reset empty
          to [0]; count cascaded.
        - Best-effort DOM via document.getElementById:
          remove `#culture{i}` and `#cultureCenter{i}`.
        - Return { cascadedOrigins, reassignedBurgs,
          reassignedStates }.
    - `createRemoveCultureTool(runtime?)` and
      `removeCultureTool`.
  - Tool name: `remove_culture`.
  - Description: references Cultures Editor trash icon,
    lists mutations (cells, burgs, states, cultures,
    origins cascade), mentions tombstone + best-effort
    DOM.
  - Schema: `culture` (int|string required).
  - Validation:
    - parseEntityRef.
    - find returns null → "No culture found..."
    - Reject id 0 → "Cannot remove culture 0 (Wildlands)."
  - Return payload: `{ i, name, cascadedOrigins,
    reassignedBurgs, reassignedStates }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near other remove-*.
  - Barrel re-export.
  - `registry.register(removeCultureTool)`.

- [ ] Write `src/ai/tools/remove-culture.test.ts`:
  - Unit (stubbed runtime):
    - removes by numeric id
    - resolves by case-insensitive name
    - rejects invalid refs
    - rejects culture 0
    - rejects unknown culture
    - surfaces runtime errors
  - `defaultRemoveCultureRuntime (integration)`:
    - stubs pack:
      - cells.culture = [0, 1, 2, 1, 2, 0]
      - cultures:
        {i:0, name:"Wildlands"},
        {i:1, name:"Highlanders", origins:[0]},
        {i:2, name:"Coastalfolk", origins:[1,0]},
        {i:3, name:"Northmen", origins:[1]},
        {i:4, name:"Gone", removed:true, origins:[1]}
      - states:
        {i:0, name:"Neutrals"},
        {i:1, name:"Altaria", culture:1},
        {i:2, name:"Brighton", culture:2}
      - burgs:
        {i:0}, {i:1, name:"Rookhold", culture:1},
        {i:2, name:"Ashholm", culture:1},
        {i:3, name:"Stormport", culture:2},
        {i:4, name:"Gone", culture:1, removed:true}
    - Remove culture 1:
      - cells.culture == [0, 0, 2, 0, 2, 0]
      - cultures[1].removed === true and name
        "Highlanders" preserved.
      - Cultures 2 and 3 cascade origins (3: [1]→[0];
        2: [1,0]→[0]).
      - cascadedOrigins === 2.
      - Burgs 1, 2 reassigned (culture 0); burg 4 not
        (removed).
      - reassignedBurgs === 2.
      - State 1 reassigned to culture 0.
      - reassignedStates === 1.
      - Removed culture 4's origins untouched.
    - rejects culture 0.
    - rejects already-removed culture 4.

- [ ] Update `README_AI.md` — row near `remove_religion`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7/1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add remove_culture tool`.

## Verification: tasks → plan

- Runtime shape covers burg / state / cell / tombstone /
  origins / DOM — all six mutations from plan.
- Counts exposed to caller match plan.

## Verification: plan → use case

- UI cascades burg.culture, state.culture, cells.culture,
  origins — tool does the same four cascades.
- Tool tombstones (removed = true) rather than deleting
  entries — matches UI (keeps array indices stable).
- DOM cleanup and editor refresh are UI-specific; tool
  covers DOM on best-effort basis.

## Verification: tests → regressions

- If burg cascade dropped, reassignedBurgs assertion +
  burg culture assertion fail.
- If state cascade dropped, reassignedStates assertion +
  state culture assertion fail.
- If cells.culture zeroing dropped, cells assertion
  fails.
- If tombstone wiped name, name assertion fails.
- If origins cascade missed empty-reset, origins
  assertion on culture 3 fails (expects [0]).
- If removed culture 4 was cascaded into, its origins
  assertion fails.
- If culture 0 protection dropped, the rejection test
  fails.
