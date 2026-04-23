# Plan 92 — remove_state AI tool

## Use case

The States Editor's trash icon
(`public/modules/dynamic/editors/states-editor.js:592`)
calls `stateRemove(id)` which fans out across many pack
collections:

1. Zeros every `pack.burgs[*].state === id` (and clears
   `capital` if set).
2. Zeros every `pack.cells.state[cell] === id`.
3. For every province in `state.provinces`:
   - Tombstone `pack.provinces[p] = {i: p, removed: true}`.
   - Zero every `pack.cells.province[cell] === p`.
   - Remove province COA / SVG.
4. For every regiment in `state.military`: remove the
   matching `notes` entry (`id === "regiment{stateId}-{i}"`).
5. Remove `#army{i}` SVG group.
6. Filter `id` out of every other active state's
   `neighbors` array.
7. Tombstone `pack.states[id] = {i: id, removed: true}`
   (note: this one REPLACES the whole object, wiping
   name — matching UI).
8. Best-effort redraws: `drawStates`, `drawBorders`,
   `drawProvinces`.
9. unfog + editor refresh.

This is the most involved `remove_*` yet. After this, the
remove family is complete (state / religion / culture /
province / burg / marker / note / regiment / route /
zone / biome).

## Scope

Add one tool: `remove_state(state)`.

- `state` — id (> 0) or case-insensitive name / fullName.
- Rejects Neutrals (id 0) and already-removed states.
- Performs the 9 side-effects above. DOM cleanup and
  redraws are best-effort.
- Returns `{ i, name, fullName, reassignedBurgs,
  removedProvinces, removedRegiments, neighborsCleaned }`.

## Implementation

1. **New file `src/ai/tools/remove-state.ts`**:
   - Imports from `./_shared`: errorResult,
     findEntityByRef, getGlobal, getNotes, getPack,
     okResult, parseEntityRef, types RawBurg,
     RawProvince, RawRegiment, RawState, RawNote.
   - Local `PackWithStateCells`.
   - `RemoveStateRef { i, name, fullName, provinces:
      number[], military: RawRegiment[] }`.
   - `RemoveStateResult { reassignedBurgs,
      removedProvinces, removedRegiments, neighborsCleaned }`.
   - `RemoveStateRuntime { find, remove }`.
   - `defaultRemoveStateRuntime.find`: findEntityByRef
     (skips id 0 + removed). Hydrate name, fullName,
     provinces (copy), military (copy).
   - `defaultRemoveStateRuntime.remove(ref)`:
     - Pack checks.
     - Cascade burgs → state=0, capital cleared.
     - cells.state zero.
     - For each provinceId in ref.provinces:
       - Tombstone pack.provinces[p] = { i: p, removed: true }.
       - Zero cells.province entries === p.
       - Best-effort DOM: provinceCOA{p}, #provinceEmblems
         use[data-i], #provincesBody #province{p},
         #province-gap{p}.
     - For each regiment in ref.military:
       - find the note with matching id
         `regiment{stateId}-{i}` and splice it out of
         globalThis.notes.
     - Best-effort: document.getElementById("army"+i).remove().
     - For each other active state: filter ref.i out of
       neighbors (count cleaned).
     - pack.states[ref.i] = { i: ref.i, removed: true }
       (replace — wipes name to match UI).
     - Best-effort DOM: #state{i}, #state-gap{i},
       #state-border{i}, #stateLabel{i},
       #textPath_stateLabel{i}, #stateCOA{i},
       #stateEmblems use[data-i].
     - unfog("focusState" + i).
     - Best-effort: drawStates, drawBorders, drawProvinces.
     - Return counts.
   - Schema: `state` (int|string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `remove-state.test.ts`:
   - Unit (stubbed runtime):
     - removes by id
     - resolves by name
     - rejects invalid refs
     - rejects state 0 (Neutrals)
     - rejects unknown state
     - surfaces runtime errors
   - Integration:
     - stubs full pack + globalThis.notes +
       drawStates/drawBorders/drawProvinces/unfog stubs.
     - removes state 1:
       - burgs with state=1 reassigned (capital cleared).
       - cells.state zeroed.
       - provinces 2,3 tombstoned; cells.province zeroed.
       - regiments' notes spliced.
       - neighbors array on other active states filtered.
       - pack.states[1] = { i: 1, removed: true }.
       - draw* and unfog called.
     - rejects state 0.
     - rejects already-removed state.

4. **README_AI.md** — row near `remove_province`.

## Verification

- `npm test -- --run src/ai/tools/remove-state` green.
- `npm test -- --run` — 1137 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Cascades burgs, cells, provinces, notes, neighbors.
- Best-effort DOM + redraw.
- Rejects Neutrals / already-removed.
