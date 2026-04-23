# Tasks 105 — add_culture AI tool

- [ ] Create `src/ai/tools/add-culture.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    getPack, okResult, type RawCulture.
  - Local PackWithHeights.
  - Exports:
    - `AddCultureCellInfo { land: boolean;
       occupiedBy: number | null }`.
    - `AddCultureResult { i, name, center, color, base,
       expansionism, type }`.
    - `AddCultureRuntime { findCell, validateCell, add }`.
    - `defaultAddCultureRuntime`:
      - findCell: window.findCell; null if missing or
        non-integer.
      - validateCell:
        - pack.cells.h[cellId] >= 20 → land.
        - pack.cultures find first active with
          center === cellId → occupiedBy.
      - add:
        - get `window.Cultures.add`; throw if missing.
        - call with cellId.
        - read pack.cultures[pack.cultures.length - 1].
        - return key fields.
    - `createAddCultureTool(runtime?)` and
      `addCultureTool`.
  - Tool name: `add_culture`.
  - Description: references Cultures Editor Add Culture,
    notes validation (land, unoccupied center),
    delegation to Cultures.add, auto-generated name.
  - Schema: x, y (numbers required).
  - Validation:
    - typeof x !== "number" || !Number.isFinite(x) → error.
    - typeof y !== "number" || !Number.isFinite(y) → error.
    - runtime.findCell null → error.
    - land false → error (water).
    - occupiedBy not null → error "cell X is already
      culture N's center".
  - Return payload: `{ i, name, center, color, base,
    expansionism, type }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near addBurgTool.
  - Barrel re-export.
  - `registry.register(addCultureTool)`.

- [ ] Write `src/ai/tools/add-culture.test.ts`:
  - Unit (stubbed):
    - happy path
    - rejects non-finite x
    - rejects non-finite y
    - rejects when findCell returns null
    - rejects water cell
    - rejects occupied cell
    - surfaces runtime errors
  - `defaultAddCultureRuntime (integration)`:
    - stubs pack.cells.h, pack.cultures, findCell,
      Cultures.add.
    - Cultures.add mock pushes a fake culture.
    - happy path: returns new culture id + fields.
    - rejects water.
    - rejects occupied (existing culture.center).
    - errors when Cultures.add missing.

- [ ] Update `README_AI.md` — row near `add_burg`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add add_culture tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Runtime seam covers findCell / validate / add.
- Two validations from the UI (land, unoccupied
  center) represented.

## Verification: plan → use case

- UI clicks a cell; AI tool accepts (x, y) and
  performs the same findCell + validate + delegate
  sequence.

## Verification: tests → regressions

- If land validation dropped, water test fails.
- If occupied-center validation dropped, occupied
  test fails.
- If delegation dropped, integration assertion fails.
- If the read-after-add step is wrong, the response
  payload assertion fails.
