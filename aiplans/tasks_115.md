# Tasks 115 — set_cells_density AI tool

- [ ] Create `src/ai/tools/set-cells-density.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    okResult.
  - Exports:
    - `CELLS_DENSITY_MAP: Record<number, number>`:
      ```
      { 1: 1000, 2: 2000, 3: 5000, 4: 10000, 5: 20000,
        6: 30000, 7: 40000, 8: 50000, 9: 60000,
        10: 70000, 11: 80000, 12: 90000, 13: 100000 }
      ```
    - `CELLS_DENSITY_OPTIONS`: readonly list of the 13
      cell counts.
    - `resolveCellsLevel(cells)` — number | null.
    - `CellsDensityRuntime { read, apply }`.
    - `defaultCellsDensityRuntime`:
      - read: document.getElementById("pointsInput")
        .value → level → CELLS_DENSITY_MAP[level] or
        null.
      - apply(level, cells):
        - Try `getGlobal<(n:number)=>void>
          ("changeCellsDensity")?.(level)`.
        - If unavailable, do manual DOM writes:
          - pointsInput.value = String(level).
          - pointsInput.dataset.cells = String(cells).
          - pointsOutputFormatted.value = cells/1000 + "K".
        - localStorage.setItem("points", String(level)).
    - `createSetCellsDensityTool(runtime?)` and
      `setCellsDensityTool`.
  - Tool name: `set_cells_density`.
  - Description: references Options Points Number
    slider, lists the 13 counts, notes passive (applied
    on next regenerate_map).
  - Schema: `cells` (integer, enum of the 13 counts).
  - Validation:
    - typeof cells !== "number" || !Number.isInteger →
      error.
    - resolveCellsLevel returns null → error + supported.
  - Noop: current cells === target.

- [ ] Register in `src/ai/index.ts`:
  - Import after setBurgTypeTool.
  - Barrel re-export + registry.register.

- [ ] Write `src/ai/tools/set-cells-density.test.ts`:
  - `resolveCellsLevel` for each supported count +
    null for unsupported (e.g. 15000).
  - `CELLS_DENSITY_OPTIONS` has length 13.
  - Unit (stubbed):
    - delegates with level
    - rejects unknown cells (e.g. 15000)
    - rejects non-integer / non-finite
    - noop when current matches
    - surfaces runtime errors
  - `defaultCellsDensityRuntime (integration)`:
    - stubs document + localStorage +
      changeCellsDensity.
    - apply with changeCellsDensity present: delegates
      + writes localStorage.
    - fallback when changeCellsDensity missing: manual
      DOM writes.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` — all pass.
- [ ] `npm run lint` — still 7 / 1.
- [ ] `npm run build` — succeeds.
- [ ] Commit: `feat(ai): add set_cells_density tool`.

## Verification: tasks → plan

- 13-value enum matches slider levels.
- Prefer delegation to changeCellsDensity matches plan.
- Fallback path matches plan.

## Verification: plan → use case

- UI: slider change → changeCellsDensity updates
  pointsInput value + dataset + formatted output.
  Tool delegates to the same function and writes
  localStorage just like the UI.

## Verification: tests → regressions

- If resolveCellsLevel drops a level, canonicalization
  test fails.
- If fallback doesn't write localStorage, integration
  test fails.
- If apply skipped changeCellsDensity, delegation
  assertion fails.
