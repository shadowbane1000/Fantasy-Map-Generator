# Plan 100 — move_burg AI tool

## Use case

The Burg Editor's relocate button
(`public/modules/ui/burg-editor.js:347`) lets a user
click a cell to move the burg. The data mutations are:

```js
cells.burg[burg.cell] = 0;
cells.burg[cellId] = id;
burg.cell = cellId;
burg.state = newState;
burg.x = x;
burg.y = y;
if (burg.capital) pack.states[newState].center = burg.cell;
```

with two UI-enforced validations:

1. No other burg may already occupy the target cell.
2. A capital burg cannot move to a different state (the
   UI shows "Capital cannot be relocated into another
   state!" and aborts).

The AI chat has no way to relocate a burg.

## Scope

Add one tool: `move_burg(burg, x, y)`.

- `burg` — id (> 0) or case-insensitive name.
- `x`, `y` — finite numbers. The tool calls `findCell(x, y)`
  to compute the new cell id.
- Validates:
  - burg exists, not removed.
  - target cell has no other burg.
  - if burg is a capital, newCell's state === burg.state.
- Writes:
  - `pack.cells.burg[oldCell] = 0`
  - `pack.cells.burg[newCell] = burg.i`
  - `burg.cell = newCell`
  - `burg.x = x`, `burg.y = y`
  - `burg.state = pack.cells.state[newCell]`
  - If capital: `pack.states[state].center = burg.cell`
- Best-effort calls `drawBurgIcon(burg)` + `drawBurgLabel(burg)`
  so the on-map icon + label move to the new position.
- Idempotent: noop when already at target coords.

## Implementation

1. **New file `src/ai/tools/move-burg.ts`**:
   - Imports from `./_shared`: errorResult,
     findEntityByRef, getGlobal, getPack,
     getPackCollection, okResult, parseEntityRef,
     type RawBurg, type RawState.
   - Local `PackWithCells`:
     ```
     interface PackWithCells {
       cells?: { burg?: number[]; state?: number[] };
       burgs?: RawBurg[];
       states?: RawState[];
     }
     ```
   - `MoveBurgRef { i, name, previousX, previousY,
      previousCell, previousState, isCapital }`.
   - `MoveBurgRuntime { find, findCell, move }`.
   - `move(ref, x, y, cellId, newStateId) -> void` —
     writes pack data + calls drawBurgIcon/Label.
   - Splits `findCell` out so we can validate "target cell
     occupied" and "cross-state capital" before calling
     `move`.
   - Schema: `burg` (int|string required), `x` (number),
     `y` (number). Both required.

2. **Register** in `src/ai/index.ts`.

3. **Tests** `move-burg.test.ts`:
   - Unit (stubbed):
     - moves by id
     - resolves by name
     - rejects non-finite x/y
     - rejects invalid refs
     - rejects unknown burg
     - rejects occupied target cell
     - rejects cross-state capital relocation
     - noop when coords unchanged
     - surfaces runtime errors
   - Integration:
     - stubs pack.cells.burg + cells.state +
       burgs + states + findCell + drawBurgIcon +
       drawBurgLabel.
     - happy path: data cascade + draw calls.
     - capital relocation within same state updates
       state.center.
     - occupied-cell rejection leaves pack untouched.

4. **README_AI.md** — row near `move_marker`.

## Verification

- `npm test -- --run src/ai/tools/move-burg` green.
- `npm test -- --run` — 1238 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Matches UI's two validations (occupied cell,
  cross-state capital).
- Updates all five pack fields + state.center.
- Best-effort icon + label redraw.
- Idempotent.
