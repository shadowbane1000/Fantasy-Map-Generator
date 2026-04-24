# Tasks 263: `get_climate_stats`

- [ ] 1. Study `find-cells-by-temperature-range.ts`,
  `find-cells-by-precipitation-range.ts`, `get-cell-info.ts` (grid-cells
  indirection), `get-population-stats.ts` (aggregate analog), and the
  `_shared/index.ts` helpers.
- [ ] 2. Create `src/ai/tools/get-climate-stats.ts`:
  - Types: `ClimateStat` ({min, max, mean}), `ClimateStats`
    ({grid_cells, temperature, precipitation}), `ClimateStatsGridLike`,
    `ClimateStatsRuntime`.
  - `readClimateStatsFromGrid(grid)` pure aggregator. Iterates
    `grid.cells.temp` and `grid.cells.prec` in a single pass, skipping
    non-finite entries per-array. Returns `ClimateStats | "not-ready"`.
  - Empty / all-invalid arrays return `{ min: 0, max: 0, mean: 0 }` for
    that stat so the output shape stays consistent.
  - `defaultClimateStatsRuntime` reading
    `getGlobal<ClimateStatsGridLike>("grid")`.
  - `createGetClimateStatsTool(runtime)` + default
    `getClimateStatsTool`.
  - Input schema: `{ type: "object", properties: {} }` (no required /
    optional parameters).
  - Description mirrors `get_population_stats` style — long, single
    paragraph, ends with "Read-only. Requires an Anthropic API key (see
    'Getting an API key' below)."
- [ ] 3. Create `src/ai/tools/get-climate-stats.test.ts`:
  - Fake grid with hand-crafted `temp` / `prec` arrays. Use
    `as unknown as { … }` casts.
  - Pure aggregator suite covers: happy-path min/max/mean; negative
    temperatures supported; single-element array; skips non-finite
    entries per-array; empty / all-invalid → zero stats; not-ready
    handling for missing grid / grid.cells / temp / prec.
  - Tool-surface suite covers: `ok: true` happy path; ignores unrelated
    input keys; `not-ready` propagation; schema export (no `required`
    array).
  - Default runtime integration block toggling `globalThis.grid`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import slot after `getBurgInfoTool` (alphabetical: `get-climate-stats`
    sits after `get-cell-info` / before `get-culture-distribution`).
  - Re-export block after the `get-cell-info` re-exports.
  - `registry.register(getClimateStatsTool)` next to
    `getPopulationStatsTool`.
- [ ] 5. Add README_AI.md row near `get_population_stats`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match
  baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_climate_stats tool`.
