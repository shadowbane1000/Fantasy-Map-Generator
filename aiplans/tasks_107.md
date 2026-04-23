# Tasks 107 — merge_states AI tool

- [ ] Create `src/ai/tools/merge-states.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getNotes, getPack,
    isActive, okResult, types RawBurg, RawNote,
    RawProvince, RawRegiment, RawState.
  - Local PackWithStateCells.
  - Exports:
    - `MergeStatesRef { rulingStateId, rulingStateName,
       fromIds, fromNames }`.
    - `MergeStatesCounts { mergedStates, reassignedBurgs,
       demotedCapitals, reassignedProvinces,
       reassignedRegiments }`.
    - `MergeStatesRuntime { resolve, merge }`.
    - `defaultMergeStatesRuntime.resolve`:
      - findEntityByRef ruling in pack.states.
      - findEntityByRef each from ref.
      - Build ids + names arrays.
    - `defaultMergeStatesRuntime.merge(ref)`:
      - Get pack; throw if missing.
      - For each fromId in ref.fromIds:
        - Mark pack.states[fromId].removed = true.
        - Best-effort DOM removals (state{i},
          state-gap{i}, state-border{i}, stateLabel{i},
          textPath_stateLabel{i}, stateCOA{i},
          stateEmblems use[data-i]).
        - For each regiment in state.military:
          - newI = rulingState.military.length.
          - Push { ...regiment, i: newI, state: ruling }
            into rulingState.military.
          - Rename note `regiment{fromId}-{old}` →
            `regiment{ruling}-{newI}`.
          - Best-effort DOM: rename element id.
        - Best-effort DOM: #army{fromId} remove.
      - Walk pack.burgs: if burg.state ∈ from, set to
        ruling; if capital, set capital = 0 (count).
      - Walk pack.provinces: if .state ∈ from, set to
        ruling (count).
      - Walk pack.cells.state: replace entries ∈ from
        with ruling.
      - Best-effort: unfog, States.getPoles, drawStates,
        drawBorders, drawProvinces, drawStateLabels.
      - Return counts.
    - `createMergeStatesTool(runtime?)` and
      `mergeStatesTool`.
  - Tool name: `merge_states`.
  - Description: references States Editor Merge dialog,
    lists cascades, notes ruling state keeps its
    name/color/capital, rejects Neutrals.
  - Schema:
    - into (int|string required).
    - from (array, minItems: 1, items: int|string).
  - Validation:
    - parseEntityRef(into).
    - from array non-empty; every item validates.
    - Resolved from ids must not include ruling id.
    - Ruling id > 0 (not Neutrals).
    - Each resolved from id > 0.
  - Return payload: `{ into: { i, name }, from: [{i, name}], ...counts }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near moveBurgTool.
  - Barrel re-export.
  - `registry.register(mergeStatesTool)`.

- [ ] Write `src/ai/tools/merge-states.test.ts`:
  - Unit (stubbed):
    - happy path with 1 from
    - happy path with 2 from
    - rejects empty from
    - rejects from containing ruling state
    - rejects invalid into ref
    - rejects invalid from refs
    - rejects Neutrals (ruling = 0)
    - rejects unknown state
    - surfaces runtime errors
  - `defaultMergeStatesRuntime (integration)`:
    - stubs pack + notes + globals.
    - merges state 2 into state 1:
      - pack.states[2].removed === true.
      - cells.state entries 2→1.
      - burgs with state=2 reassigned to 1; capital
        cleared.
      - provinces with state=2 reassigned.
      - regiment notes renamed.
      - counts in payload.

- [ ] Update `README_AI.md` — row near `remove_state`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add merge_states tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- All five cascades from plan are in merge().
- Notes renamed per plan.

## Verification: plan → use case

- UI mergeStates walks the same cascades:
  states.removed, state.military → ruling.military,
  burgs, provinces, cells.state, plus DOM / redraws.
- Tool covers the five data cascades + best-effort DOM
  and renderer calls.

## Verification: tests → regressions

- If a cascade is dropped, counts + integration
  assertions fail.
- If note renaming is dropped, the notes assertion fails.
- If capital demotion is dropped, the capital check
  fails.
- If ruling-in-from not rejected, that validation test
  fails.
