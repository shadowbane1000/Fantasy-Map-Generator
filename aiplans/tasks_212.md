# Tasks 212 — `find_cells_by_temperature_range`

- [ ] Implement `src/ai/tools/find-cells-by-temperature-range.ts`
  - [ ] Export constants
        `DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT` (10000),
        `MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT` (100000),
        `MIN_TEMPERATURE` (-128), `MAX_TEMPERATURE` (127).
  - [ ] `findCellsByTemperatureRangeInPack(pack, grid, min, max, limit)`
        pure collector.
  - [ ] `FindCellsByTemperatureRangeRuntime` interface +
        `defaultFindCellsByTemperatureRangeRuntime`.
  - [ ] `createFindCellsByTemperatureRangeTool(runtime?)` factory +
        `findCellsByTemperatureRangeTool` singleton.
  - [ ] Runtime validation for `min`, `max`, `limit`.
  - [ ] Map `"not-ready"` → `errorResult`.
- [ ] Write `src/ai/tools/find-cells-by-temperature-range.test.ts` with
      three describe blocks:
  - [ ] Pure collector (mid-range, inclusive boundaries, single value,
        full range, empty, limit/count, not-ready pack, not-ready grid).
  - [ ] Tool surface (happy path, missing/invalid min/max, min>max,
        limit, not-ready, default limit, schema shape, constants).
  - [ ] `defaultFindCellsByTemperatureRangeRuntime` integration (stub
        `globalThis.pack` and `globalThis.grid`, `as unknown as`
        casts).
- [ ] Register `findCellsByTemperatureRangeTool` in `src/ai/index.ts`:
  - [ ] Import next to `findCellsByHeightRangeTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findCellsByTemperatureRangeTool)` in
        `buildDefaultRegistry`.
- [ ] Add README_AI.md row near `find_cells_by_height_range`:
  - [ ] Description includes `min`, `max`, `limit`, error modes,
        typical usage, grid.cells.temp indirection.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API
        key' below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass.
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message
      `feat(ai): add find_cells_by_temperature_range tool` + 1-2 line
      body.
