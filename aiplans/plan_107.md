# Plan 107 — merge_states AI tool

## Use case

The States Editor's "Merge states" dialog
(`public/modules/dynamic/editors/states-editor.js:1286`)
lets the user absorb one or more states into a "ruling
state". The ruling state keeps its name, color, capital.
The merged states' regiments, burgs, provinces, and
cells are all reassigned to the ruling state; capitals
of merged states are demoted.

This is a common "consolidate the empire" operation
that isn't yet in the AI tool set. `remove_state` can
delete an individual state, but merging preserves data
by moving it to the ruling state rather than discarding.

## Scope

Add one tool: `merge_states(into, from)`.

- `into` — ruling state: id (> 0) or case-insensitive
  name / fullName.
- `from` — array of state ids or case-insensitive names.
  At least one entry; may not include the ruling state.
- Validates:
  - ruling state exists, active, non-neutral.
  - each merge-from resolves, is active, isn't 0.
  - from does not contain the ruling state.
- For each stateId in from:
  - `pack.states[stateId].removed = true`.
  - For each regiment in that state's military:
    - Copy to rulingState.military with a fresh index.
    - Rename the matching `regiment{oldState}-{oldI}`
      note → `regiment{rulingState}-{newI}`.
- Reassign `pack.burgs[*].state` from any merged state
  to rulingState; demote capital flags.
- Reassign `pack.provinces[*].state` similarly.
- Replace every `pack.cells.state[i]` entry referencing
  a merged state with rulingState.
- Best-effort: SVG cleanup, `unfog()`, `States.getPoles`,
  `drawStates`, `drawBorders`, `drawProvinces`,
  `drawStateLabels`.
- Returns counts: `{ mergedStates, reassignedBurgs,
  demotedCapitals, reassignedProvinces, reassignedRegiments }`.

## Implementation

1. **New file `src/ai/tools/merge-states.ts`**:
   - Imports: errorResult, findEntityByRef, getGlobal,
     getNotes, getPack, isActive, okResult, types
     RawBurg, RawNote, RawProvince, RawRegiment,
     RawState from `./_shared`.
   - Local `PackWithStateCells`.
   - `MergeStatesRef { rulingStateId, rulingStateName,
      fromIds: number[], fromNames: string[] }`.
   - `MergeStatesCounts { mergedStates,
      reassignedBurgs, demotedCapitals,
      reassignedProvinces, reassignedRegiments }`.
   - `MergeStatesRuntime { resolve, merge }`.
   - `defaultMergeStatesRuntime`:
     - resolve: findEntityByRef for each ref; collect
       into arrays. Reject Neutrals and ruling-in-from.
     - merge: perform the cascade.
   - Schema: `into` (int|string required), `from` (array
     of int|string, min 1).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `merge-states.test.ts`:
   - Unit (stubbed):
     - happy path delegates with parsed refs
     - rejects empty from
     - rejects when from contains ruling state
     - rejects invalid refs
     - rejects Neutrals
     - rejects unknown states
     - surfaces runtime errors
   - Integration:
     - stubs pack + notes + globals.
     - merges state 2 into state 1: cells.state and
       burg.state reassigned; state 2 marked removed;
       regiment notes renamed; counts correct.

4. **README_AI.md** — row near `remove_state`.

## Verification

- `npm test -- --run src/ai/tools/merge-states` green.
- `npm test -- --run` — 1311 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- All five cascades (states.removed, regiments, burgs,
  provinces, cells) match UI.
- Regiment note IDs renamed.
- Best-effort redraws and DOM cleanup.
- Counts returned for transparency.
