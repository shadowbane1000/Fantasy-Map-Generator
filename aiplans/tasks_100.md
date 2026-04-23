# Tasks 100 — move_burg AI tool

- [ ] Create `src/ai/tools/move-burg.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getPack,
    getPackCollection, okResult, parseEntityRef,
    types RawBurg, RawState.
  - Local PackWithCells shape.
  - Exports:
    - `MoveBurgRef { i, name, previousX, previousY,
       previousCell, previousState, isCapital }`.
    - `MoveBurgCellInfo { cellId: number; cellState: number }`.
    - `MoveBurgRuntime`:
      - `find(ref) -> MoveBurgRef | null`.
      - `findCell(x, y) -> MoveBurgCellInfo | null` —
        null when findCell global missing; else
        `{ cellId, cellState: pack.cells.state[cellId] ?? 0 }`.
      - `cellOccupiedBy(cellId) -> number` — returns the
        burg id at that cell (0 = unoccupied).
      - `move(ref, x, y, cellId, newState) -> void`:
        - get pack.burgs, pack.cells.burg
        - clear pack.cells.burg[previousCell] if > 0.
        - assign pack.cells.burg[cellId] = burg.i.
        - burg.cell = cellId, burg.x = x, burg.y = y,
          burg.state = newState.
        - if burg.capital, pack.states[newState].center =
          cellId.
        - best-effort drawBurgIcon(burg) + drawBurgLabel(burg).
    - `defaultMoveBurgRuntime`.
    - `createMoveBurgTool(runtime?)` and `moveBurgTool`.
  - Tool name: `move_burg`.
  - Description: references Burg Editor relocate,
    lists validations, notes idempotency.
  - Schema: burg (int|string required), x (number),
    y (number).
  - Validation:
    - parseEntityRef(burg).
    - typeof x / y !== "number" || !Number.isFinite → error.
    - find returns null → "No burg found..."
    - previousX === x && previousY === y → noop early
      return (don't call findCell).
    - runtime.findCell(x, y) returns null → error
      "findCell is not available" or similar.
    - cellOccupiedBy(cellInfo.cellId) → if > 0 and !==
      ref.i → error "Target cell already has a burg".
    - ref.isCapital && cellInfo.cellState !==
      ref.previousState → error "Capital cannot be
      relocated into another state".
  - Return payload: `{ i, name, x, y, cell, state,
     previousX, previousY, previousCell, previousState,
     noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near moveMarkerTool / moveRegimentTool.
  - Barrel re-export.
  - `registry.register(moveBurgTool)`.

- [ ] Write `src/ai/tools/move-burg.test.ts`:
  - Unit (stubbed runtime):
    - moves by id (returns full payload)
    - resolves by case-insensitive name
    - noop when coords unchanged (findCell not called)
    - rejects non-finite x
    - rejects non-finite y
    - rejects invalid refs
    - rejects unknown burg
    - rejects when findCell returns null
    - rejects occupied target cell (cellOccupiedBy > 0
      and !== ref.i)
    - allows "moving" to the same cell (occupied by self)
      when coords actually change
    - rejects cross-state capital relocation
    - surfaces runtime errors
  - `defaultMoveBurgRuntime (integration)`:
    - stubs pack.cells (burg array, state array), burgs,
      states, findCell, drawBurgIcon, drawBurgLabel.
    - happy path: coords updated, cells.burg updated on
      both old and new cells, state updated if different.
    - capital within same state: state.center updated.
    - occupied-cell rejection leaves pack unchanged.

- [ ] Update `README_AI.md` — row near `move_marker`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add move_burg tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Three runtime methods (find, findCell,
  cellOccupiedBy, move) separate validation from
  mutation — testable.
- Both UI validations (occupied, cross-state capital)
  represented.

## Verification: plan → use case

- UI does exactly these five mutations. Tool does the
  same. Capital center update matches the UI's `if
  (burg.capital) pack.states[newState].center =
  burg.cell;`.

## Verification: tests → regressions

- If cells.burg old-cell clear dropped, integration
  asserts fail.
- If cross-state capital check dropped, that rejection
  test fails.
- If occupied-cell check dropped, that test fails.
- If noop path dropped, findCell would be called
  unnecessarily; test asserts that findCell isn't
  called in the noop path.
- If state.center update dropped, capital integration
  test fails.
- If drawBurgIcon/Label dropped, the integration
  assertions on those mocks fail.
