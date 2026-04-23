# Tasks 106 — add_religion AI tool

- [ ] Add `center?: number` to RawReligion (done — was
  added before this file).

- [ ] Create `src/ai/tools/add-religion.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    getPack, okResult, type RawReligion.
  - Local PackWithHeights.
  - Exports:
    - `AddReligionCellInfo { land, occupiedBy }`.
    - `AddReligionResult { i, name, center, color, type,
       form, deity, expansion, expansionism }`.
    - `AddReligionRuntime { findCell, validateCell, add }`.
    - `defaultAddReligionRuntime`:
      - findCell: window.findCell.
      - validateCell: pack.cells.h[cellId] ≥ 20; walk
        pack.religions for !removed && center === cellId.
      - add:
        - getGlobal(Religions); throw if missing or no
          `.add`.
        - Religions.add(cellId).
        - Read last pushed religion.
    - `createAddReligionTool(runtime?)` and
      `addReligionTool`.
  - Tool name: `add_religion`.
  - Description: references Religions Editor Add
    Religion, notes validation + Religions.add
    delegation.
  - Schema: x, y (numbers required).
  - Validation:
    - typeof x/y not number OR not finite → error.
    - findCell returns null → error.
    - land false → error.
    - occupiedBy not null → error.
  - Return payload: the new religion fields.

- [ ] Register in `src/ai/index.ts`:
  - Import near addCultureTool.
  - Barrel re-export.
  - `registry.register(addReligionTool)`.

- [ ] Write `src/ai/tools/add-religion.test.ts`:
  - Unit (stubbed):
    - happy path
    - rejects non-finite x
    - rejects non-finite y
    - rejects findCell null
    - rejects water
    - rejects occupied
    - surfaces runtime errors
  - `defaultAddReligionRuntime (integration)`:
    - stubs pack.cells.h, pack.religions, findCell,
      Religions.add.
    - happy path + water/occupied rejections + missing
      Religions.add.

- [ ] Update `README_AI.md` — row near `add_culture`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add add_religion tool`.

## Verification: tasks → plan

- File + registration = plan's "callable".
- Validations match plan.
- Delegation matches plan.

## Verification: plan → use case

- UI clicks cell → findCell → validate → Religions.add.
- Tool does same sequence with (x, y).

## Verification: tests → regressions

- If water validation dropped, water test fails.
- If occupied-center validation dropped, occupied test
  fails.
- If delegation dropped, integration test fails.
- If last-religion read wrong, payload test fails.
