# Plan 103 — add_burg AI tool

## Use case

The Tools panel's "Add Burg" button
(`public/modules/ui/burgs-overview.js:244`) puts the
user into click-on-cell mode. Clicking a land cell
(h ≥ 20, not already occupied) calls `Burgs.add([x,y])`
(`src/modules/burgs-generator.ts:655`) which:

1. Computes `cellId = findCell(x, y)`.
2. Picks name, culture, state from that cell.
3. Creates the burg with default `capital: 0`, `port: 0`.
4. Populates it, defines emblem, generates COA, defines
   features, assigns a group based on population.
5. Pushes to `pack.burgs`; sets `cells.burg[cellId]`.
6. Calls `Routes.connect` + `drawRoute`, `drawBurgIcon`,
   `drawBurgLabel`.

The AI chat has `remove_burg`, `move_burg`, and per-field
tools for existing burgs, but no way to create a new
burg.

## Scope

Add one tool: `add_burg(x, y)`.

- `x`, `y` — finite numbers.
- Validates:
  - findCell is available.
  - target cell is land (`pack.cells.h[cellId] >= 20`).
  - target cell is unoccupied (`pack.cells.burg[cellId]
    === 0`).
- Delegates to `window.Burgs.add([x, y])`; returns
  burgId + the populated burg fields.
- Optional: after creation, apply name override if
  requested. For simplicity we'll skip that — the AI
  can call `rename_burg` after `add_burg`.

## Implementation

1. **New file `src/ai/tools/add-burg.ts`**:
   - Imports: errorResult, getGlobal, getPack,
     getPackCollection, okResult, type RawBurg from
     `./_shared`.
   - Local `PackWithHeights`:
     ```
     interface PackWithHeights {
       cells?: { h?: ArrayLike<number>; burg?: number[] };
       burgs?: RawBurg[];
     }
     ```
   - `AddBurgRuntime`:
     - `findCell(x, y)` → cellId | null.
     - `landOccupancy(cellId)` → `{ land: boolean;
        occupiedBy: number }`.
     - `add(x, y)` → `{ i, cell, state, culture, name,
        port, capital }` (reading from pack.burgs after
        Burgs.add).
   - `defaultAddBurgRuntime`:
     - findCell: delegate to global.
     - landOccupancy: read pack.cells.h, pack.cells.burg.
     - add: get `Burgs.add`; throw if missing; call with
       [x, y]; read the new burg back from
       pack.burgs[pack.burgs.length - 1].
   - Schema: `x` (number required), `y` (number required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `add-burg.test.ts`:
   - Unit (stubbed):
     - happy path: delegates with (x, y); returns burg
       fields.
     - rejects non-finite x/y.
     - rejects when findCell null.
     - rejects non-land cell (h < 20).
     - rejects occupied cell.
     - surfaces runtime errors.
   - Integration:
     - stubs pack.cells.h, cells.burg, pack.burgs,
       findCell, Burgs.add (fake that pushes a minimal
       burg record).
     - happy path: add gets called with [x, y]; return
       payload carries the new burg's id.
     - rejects sea cell.
     - rejects occupied cell.
     - errors when Burgs.add is missing.

4. **README_AI.md** — row near `remove_burg`.

## Verification

- `npm test -- --run src/ai/tools/add-burg` green.
- `npm test -- --run` — 1269 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Two UI validations (land, unoccupied) represented.
- Delegates to Burgs.add for the heavy lifting.
- Returns the new burg's key fields.
