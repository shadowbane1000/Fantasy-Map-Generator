# Plan 106 — add_religion AI tool

## Use case

The Religions Editor's Add Religion mode
(`public/modules/dynamic/editors/religions-editor.js:783`)
lets a user click a cell. The handler:

1. findCell(x, y).
2. Validates land (`h >= 20`).
3. Validates the cell is not already a religion center.
4. Calls `Religions.add(center)` in
   `src/modules/religions-generator.ts:1006` which picks
   type/form/deity from context, assigns color, origins,
   expansion extent, name, expansionism, and pushes to
   `pack.religions`.

Parallels the `add_culture` I just added — same pattern
with religion-specific validation.

## Scope

Add one tool: `add_religion(x, y)`.

- `x`, `y` — finite numbers.
- Validates: findCell available, land cell, no existing
  religion center at the cell.
- Delegates to `window.Religions.add(cellId)`.
- Returns `{ i, name, center, color, type, form, deity,
  expansion, expansionism }`.

## Implementation

1. **New file `src/ai/tools/add-religion.ts`**:
   - Imports: errorResult, getGlobal, getPack,
     okResult, type RawReligion from `./_shared`.
   - Local `PackWithHeights`.
   - `AddReligionRuntime`:
     - `findCell(x, y)` → cellId | null.
     - `validateCell(cellId)` → `{ land, occupiedBy }`.
     - `add(cellId)` → new religion fields.
   - `defaultAddReligionRuntime`:
     - findCell: window.findCell.
     - validateCell: pack.cells.h + walk pack.religions.
     - add: call window.Religions.add; read last
       religion; return fields.
   - Schema: x, y (numbers required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `add-religion.test.ts`:
   - Unit (stubbed):
     - happy path
     - rejects non-finite x/y
     - rejects findCell null
     - rejects water
     - rejects occupied
     - surfaces runtime errors
   - Integration:
     - stubs pack, findCell, Religions.add.
     - happy path returns new religion.
     - rejects water/occupied.
     - errors when Religions.add missing.

4. **README_AI.md** — row near `add_culture`.

## Verification

- `npm test -- --run src/ai/tools/add-religion` green.
- `npm test -- --run` — 1300 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Three validations represented.
- Delegates to Religions.add.
- Returns key fields of the new religion.
