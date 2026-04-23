# Plan 91 — remove_culture AI tool

## Use case

The Cultures Editor
(`public/modules/dynamic/editors/cultures-editor.js:511`)
exposes a trash icon per culture. Confirming the prompt
runs `removeCulture(id)`:

1. Removes SVG `#culture{i}` and `#cultureCenter{i}`.
2. Reassigns every `burg.culture === id` to `0`
   (Wildlands).
3. Reassigns every `state.culture === id` to `0`.
4. Zeroes every `pack.cells.culture[cell] === id`.
5. Marks `pack.cultures[i].removed = true` (tombstone).
6. Filters the removed id out of every other active
   culture's `origins` array (resetting empties to `[0]`).
7. Refreshes the editor panel.

Remove tools already exist for province, religion,
burg, regiment, route, zone, biome, marker, note. Culture
removal is the missing peer.

## Scope

Add one tool: `remove_culture(culture)`.

- `culture` — id (> 0) or case-insensitive name.
- Rejects Wildlands (id 0) and already-removed cultures.
- Performs all six mutations above (DOM + editor refresh
  are best-effort).
- Returns counts: `{ i, name, cascadedOrigins,
  reassignedBurgs, reassignedStates }` — transparency on
  how much collateral was touched.

## Implementation

1. **New file `src/ai/tools/remove-culture.ts`**:
   - Imports: errorResult, findEntityByRef, getPack,
     okResult, parseEntityRef, types RawBurg,
     RawCulture, RawState from `./_shared`.
   - Local `PackWithCultureCells` shape.
   - `RemoveCultureRef { i, name }`.
   - `RemoveCultureResult { cascadedOrigins: number;
      reassignedBurgs: number; reassignedStates: number }`.
   - `RemoveCultureRuntime { find, remove }`.
   - `defaultRemoveCultureRuntime`:
     - find: findEntityByRef on cultures (skips id 0 /
       removed).
     - remove(ref):
       - Get pack; throw if missing / cultures missing.
       - Reassign burgs: for each burg with
         `culture === ref.i`, set to 0; count.
       - Reassign states: same.
       - Zero cells.culture entries.
       - Tombstone cultures[ref.i].removed = true.
       - Walk other active cultures; filter origins to
         drop ref.i, reset empty → [0]; count cascaded.
       - Best-effort DOM: remove `#culture{i}` and
         `#cultureCenter{i}` via document.getElementById.
       - Return counts.
   - Schema: `culture` (int|string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `remove-culture.test.ts`:
   - Unit (stubbed):
     - removes by id
     - resolves by name
     - rejects invalid refs
     - rejects culture 0
     - rejects unknown culture
     - surfaces runtime errors
   - Integration:
     - stubs pack.cells.culture, pack.cultures,
       pack.states, pack.burgs.
     - removes culture 1:
       - burgs with culture 1 become 0; count reported.
       - states with culture 1 become 0; count reported.
       - cells.culture zeros entries.
       - cultures[1].removed = true, name preserved.
       - other active cultures' origins cascaded,
         empty → [0].
       - removed culture is not cascaded into.
     - rejects culture 0.
     - rejects already-removed culture.

4. **README_AI.md** — row near `remove_religion`.

## Verification

- `npm test -- --run src/ai/tools/remove-culture` green.
- `npm test -- --run` — 1127 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool callable, wired, documented.
- Mutates cells.culture, cultures[i] (tombstone),
  burgs[*].culture, states[*].culture, and other
  cultures' origins — matching the UI.
- Rejects Wildlands / already-removed.
- Response transparency on collateral counts.
