# Plan 105 — add_culture AI tool

## Use case

The Cultures Editor's "Add Culture" mode
(`public/modules/dynamic/editors/cultures-editor.js:812`)
lets the user click a cell. The click handler:

1. Finds cellId via `findCell(x, y)`.
2. Validates the cell is land (`h >= 20`) — rejects
   water.
3. Validates no active culture's `.center` points at
   that cell.
4. Calls `Cultures.add(center)` in
   `src/modules/cultures-generator.ts:1244` which picks
   a culture name (from defaults if under that count;
   otherwise riffing off a random existing culture),
   defines expansionism, color, code, emblem shape,
   origins, and pushes to `pack.cultures`.

The AI chat has `remove_culture`, `rename_culture`, etc.
but no way to create a new culture. `add_burg` started
entity creation; this is the second.

## Scope

Add one tool: `add_culture(x, y)`.

- `x`, `y` — finite numbers.
- Validates:
  - findCell available.
  - cell is land.
  - cell is not already a culture center.
- Delegates to `window.Cultures.add(center)`.
- Returns the new culture's `i`, `name`, `center`,
  `color`, `base`, `expansionism`, `type`.

## Implementation

1. **New file `src/ai/tools/add-culture.ts`**:
   - Imports: errorResult, getGlobal, getPack,
     okResult, type RawCulture from `./_shared`.
   - Local `PackWithHeights`.
   - `AddCultureRuntime`:
     - `findCell(x, y)` → cellId | null.
     - `validateCell(cellId)` → `{ land: boolean;
        occupiedBy: number | null }` where `occupiedBy`
        is the id of a culture whose `.center === cellId`,
        else null.
     - `add(cellId)` → `{ i, name, center, color, base,
        expansionism, type }` after reading the new
        culture from pack.
   - `defaultAddCultureRuntime`:
     - findCell: window.findCell.
     - validateCell: reads pack.cells.h and walks
       pack.cultures.
     - add: calls `window.Cultures.add(cellId)` (throws
       if missing); reads the pushed culture (last entry).
   - Schema: x, y (numbers, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `add-culture.test.ts`:
   - Unit (stubbed):
     - happy path: findCell + validate + delegate
     - rejects non-finite x/y
     - rejects when findCell returns null
     - rejects water cell
     - rejects occupied cell
     - surfaces runtime errors
   - Integration:
     - stubs pack.cells.h, pack.cultures, findCell,
       Cultures.add (simulates the pack mutation).
     - happy path: Cultures.add called with cellId;
       response payload carries the new culture.
     - rejects water.
     - rejects occupied.
     - errors when Cultures.add missing.

4. **README_AI.md** — row near `add_burg`.

## Verification

- `npm test -- --run src/ai/tools/add-culture` green.
- `npm test -- --run` — 1289 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Three validations (land, unoccupied center, findCell
  available).
- Delegates to Cultures.add; returns the new culture's
  key fields.
