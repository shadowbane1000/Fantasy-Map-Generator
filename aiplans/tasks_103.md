# Tasks 103 — add_burg AI tool

- [ ] Create `src/ai/tools/add-burg.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    getPack, okResult, type RawBurg.
  - Local PackWithHeights.
  - Exports:
    - `AddBurgLandInfo { land: boolean; occupiedBy: number }`.
    - `AddBurgResult { i, cell, state, culture, name, x, y, port, capital }`.
    - `AddBurgRuntime { findCell, landOccupancy, add }`.
    - `defaultAddBurgRuntime`:
      - findCell: delegate to window.findCell; return
        null if missing or non-integer.
      - landOccupancy(cellId):
        - pack.cells.h[cellId] ≥ 20 → land: true.
        - pack.cells.burg[cellId] → occupiedBy (0 =
          unoccupied).
      - add(x, y):
        - Get `window.Burgs.add` (Burgs module); throw
          if missing.
        - call Burgs.add([x, y]) → returns id.
        - Re-read `pack.burgs[id]` and extract fields.
        - Return populated AddBurgResult.
    - `createAddBurgTool(runtime?)` / `addBurgTool`.
  - Tool name: `add_burg`.
  - Description: references Tools panel Add Burg,
    notes Burgs.add delegation, mentions follow-up
    rename_burg / set_burg_culture / set_burg_type to
    tweak the created burg.
  - Schema: x (number required), y (number required).
  - Validation:
    - typeof x / y !== "number" || !Number.isFinite(x/y)
      → error.
    - runtime.findCell(x, y) returns null → error
      "findCell is not available".
    - landOccupancy.land === false → error "target cell
      is water".
    - landOccupancy.occupiedBy > 0 → error "cell already
      has burg {id}".
  - Return payload: `{ i, cell, state, culture, name, x,
    y, port, capital }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near addMarkerTool.
  - Barrel re-export.
  - `registry.register(addBurgTool)`.

- [ ] Write `src/ai/tools/add-burg.test.ts`:
  - Unit (stubbed runtime):
    - happy path: findCell + landOccupancy + add
      delegation; response payload.
    - rejects non-finite x
    - rejects non-finite y
    - rejects when findCell returns null
    - rejects water cell (land: false)
    - rejects occupied cell (occupiedBy > 0)
    - surfaces runtime errors from add
  - `defaultAddBurgRuntime (integration)`:
    - stubs pack.cells.h, pack.cells.burg, pack.burgs,
      findCell, Burgs.add (pushing a stub record).
    - happy path: Burgs.add called with [x, y]; new
      burg's id returned.
    - rejects water cell.
    - rejects occupied cell.
    - errors when Burgs.add is missing.

- [ ] Update `README_AI.md` — row near `remove_burg`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add add_burg tool`.

## Verification: tasks → plan

- File + registration cover plan's "callable".
- Runtime seam (findCell / landOccupancy / add) keeps
  validation separate from mutation — testable.
- Both UI validations are represented.

## Verification: plan → use case

- UI flow: crosshair → click → validate land + empty →
  Burgs.add. Tool does the same validations then
  delegates to Burgs.add.

## Verification: tests → regressions

- If water-cell validation dropped, the water test
  fails.
- If occupied-cell validation dropped, that test fails.
- If delegation dropped, the integration test fails
  (Burgs.add mock assertion).
- If findCell missing wasn't caught, the findCell-null
  test fails.
- If non-finite validation dropped, those tests fail.
