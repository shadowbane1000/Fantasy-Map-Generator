# Plan 110 — add_regiment AI tool

## Use case

The Regiment Editor's "Add" button
(`public/modules/ui/regiment-editor.js:239`) puts the
user into click-on-cell mode. A click:

1. Computes `cellId = findCell(x, y)`.
2. Snaps to the cell centroid: `[x, y] =
   pack.cells.p[cell]`.
3. Reads the owning state from the editor (for the AI
   tool, caller passes it).
4. New regiment id = `last(military).i + 1` (or 0 if
   empty).
5. Naval flag `n = +(cells.h[cell] < 20)` — naval if
   water.
6. Creates `{ a: 0, cell, i, n, u: {}, x, y, bx: x,
   by: y, state, icon: "🛡️" }`.
7. Auto-names via `Military.getName`.
8. Pushes to `state.military`.
9. Creates the legend note via
   `Military.generateNote`.
10. Draws the regiment via `drawRegiment`.

The AI chat has rename / remove / split / icon / naval /
unit / move for existing regiments but no way to create
one. This is the last add_* I planned.

## Scope

Add one tool: `add_regiment(state, x, y)`.

- `state` — owning state, id (≥ 0) or case-insensitive
  name / fullName (same pattern as other regiment
  tools).
- `x`, `y` — finite numbers. (The new regiment snaps
  to the cell centroid; the passed values pick the
  cell via `findCell`.)
- Validates: state is active, findCell available.
- Delegates to `Military.getName` / `Military.generateNote`
  / `drawRegiment` where available.
- Returns the new regiment's key fields.

## Implementation

1. **New file `src/ai/tools/add-regiment.ts`**:
   - Imports: errorResult, getGlobal, getPack, isActive,
     okResult, types RawRegiment, RawState from
     `./_shared`; BurgPackLike + resolveStateRefInPack
     from `./list-burgs`.
   - Local `PackWithCells`.
   - `AddRegimentResult { i, name, cell, x, y, n, state }`.
   - `AddRegimentRuntime { findState, findCell,
      centroid, naval, add }`.
   - `defaultAddRegimentRuntime`:
     - findState: resolveStateRefInPack + isActive;
       returns `{ stateId, stateName }` or null.
     - findCell: delegate global; null if missing.
     - centroid: read pack.cells.p[cellId].
     - naval: read pack.cells.h[cellId] < 20 → 1 | 0.
     - add(stateId, cellId, cx, cy, n):
       - Get Military module; throw if getName missing.
       - Look up state.military; get next i.
       - Build regiment.
       - Auto-name via Military.getName.
       - Push to state.military.
       - Best-effort Military.generateNote.
       - Best-effort drawRegiment.
       - Return result.
   - Schema: state (int|string), x (number), y (number).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `add-regiment.test.ts`:
   - Unit (stubbed):
     - happy path
     - resolves state by name
     - rejects non-finite x/y
     - rejects invalid state ref
     - rejects unknown state
     - rejects findCell null
     - surfaces runtime errors
   - Integration:
     - stubs pack + Military + drawRegiment + findCell.
     - creates a regiment on a land cell (n=0).
     - creates a regiment on a water cell (n=1).
     - errors when Military.getName missing.

4. **README_AI.md** — row near `set_regiment_unit`.

## Verification

- `npm test -- --run src/ai/tools/add-regiment` green.
- `npm test -- --run` — 1347 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Regiment created with UI-matching defaults (icon
  🛡️, a=0, u={}, naval flag from cell height,
  position = cell centroid).
- Delegates to Military.getName / generateNote and
  drawRegiment when available.
- Returns the new regiment's key fields.
