# Plan 115 — set_cells_density AI tool

## Use case

The Options dialog has a Points Number slider
(`src/index.html:1639`) that controls map resolution:
cell count between 1K and 100K. The slider maps 13 levels
to cell counts:

| Level | Cells  |
|------:|-------:|
|     1 |   1000 |
|     2 |   2000 |
|     3 |   5000 |
|     4 |  10000 |
|     5 |  20000 |
|     6 |  30000 |
|     7 |  40000 |
|     8 |  50000 |
|     9 |  60000 |
|    10 |  70000 |
|    11 |  80000 |
|    12 |  90000 |
|    13 | 100000 |

Changing the slider runs `changeCellsDensity(level)`
(options.js:333) which:
- Writes `pointsInput.value = level`.
- Writes `pointsInput.dataset.cells = cells`.
- Updates `pointsOutputFormatted` label ("10K", "50K", …).
- Colors the formatted output by density.

Higher cell counts mean more detailed maps but slower
generation. Users often tune this.

## Scope

Add one tool: `set_cells_density(cells)`.

- `cells` — target cell count. One of the 13 supported
  values (1000, 2000, 5000, 10000, 20000, 30000, …,
  100000).
- Delegates to `window.changeCellsDensity(level)` to
  get the full UI update (slider position + label +
  color). Falls back to manual DOM writes if
  changeCellsDensity is missing.
- Writes `localStorage["points"] = level`.
- Idempotent: noop when already at target.

## Implementation

1. **New file `src/ai/tools/set-cells-density.ts`**:
   - Imports: errorResult, getGlobal, okResult from
     `./_shared`.
   - `CELLS_DENSITY_MAP: Record<number, number>` —
     level → cells count.
   - `CELLS_DENSITY_OPTIONS: readonly number[]` — the
     valid cell counts.
   - `resolveCellsLevel(cells)` — find the level for a
     given cell count, or null if not supported.
   - `CellsDensityRuntime { read, apply }`.
   - `defaultCellsDensityRuntime`:
     - read: read pointsInput.value (the level) → cell
       count via map, or null.
     - apply(level, cells): call
       `window.changeCellsDensity(level)` if available,
       else write pointsInput.value / dataset.cells /
       pointsOutputFormatted.value directly. Also
       write localStorage["points"] = level.
   - Schema: `cells` (integer enum of the 13 values,
     required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-cells-density.test.ts`:
   - `resolveCellsLevel` returns level for each
     supported count and null for unsupported.
   - Unit (stubbed):
     - delegates with level
     - rejects unknown cells count
     - rejects non-integer / non-finite
     - noop when current matches
     - surfaces runtime errors
   - Integration:
     - stubs document + localStorage +
       changeCellsDensity.
     - apply delegates to changeCellsDensity with level
       + writes localStorage.
     - fallback when changeCellsDensity missing: writes
       pointsInput manually.

4. **README_AI.md** — row near `set_generator_rates`.

## Verification

- `npm test -- --run src/ai/tools/set-cells-density`
  green.
- `npm test -- --run` — 1403 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- 13 cell-count options supported.
- Prefers changeCellsDensity delegation; falls back
  to DOM writes.
- Idempotent.
