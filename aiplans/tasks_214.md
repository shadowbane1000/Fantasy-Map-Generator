# Tasks 214 — `find_cells_by_population_range`

- [ ] Implement `src/ai/tools/find-cells-by-population-range.ts`
  - [ ] Export constants `DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT`
        (10000), `MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT` (100000),
        `MIN_POPULATION` (0).
  - [ ] `findCellsByPopulationRangeInPack(pack, min, max, limit)` pure
        collector — iterates `pack.cells.pop` directly (no grid
        indirection).
  - [ ] `FindCellsByPopulationRangeRuntime` interface +
        `defaultFindCellsByPopulationRangeRuntime` that pulls `pack` from
        globals.
  - [ ] `createFindCellsByPopulationRangeTool(runtime?)` factory +
        `findCellsByPopulationRangeTool` singleton.
  - [ ] Runtime validation for `min` (finite number `>= 0`), `max` (finite
        number `>= 0`, `>= min`), `limit` (integer in `[1, 100000]`).
  - [ ] Map `"not-ready"` → `errorResult`.
  - [ ] Description explicitly documents that `min`/`max` are raw
        pre-scale `pack.cells.pop` values (multiplied by `populationRate`
        to get inhabitant counts).
- [ ] Write `src/ai/tools/find-cells-by-population-range.test.ts` with
      three describe blocks:
  - [ ] Pure collector (mid-range, inclusive boundaries, single value,
        empty-cell range, empty, limit/count, not-ready × pack/cells/pop).
  - [ ] Tool surface (happy path, fractional min/max, missing / invalid
        min / max, negative values, min>max, limit, not-ready, default
        limit, schema shape, constants).
  - [ ] `defaultFindCellsByPopulationRangeRuntime` integration (stub
        `globalThis.pack`, assert via `as unknown as { pack?: unknown }`).
- [ ] Register `findCellsByPopulationRangeTool` in `src/ai/index.ts`:
  - [ ] Import next to `findCellsByPrecipitationRangeTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findCellsByPopulationRangeTool)` in
        `buildDefaultRegistry` next to precipitation-range registration.
- [ ] Add README_AI.md row near `find_cells_by_precipitation_range`:
  - [ ] Description includes `min`, `max`, `limit`, error modes, the
        pre-scale caveat, and typical usage.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API key'
        below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass (new tests included).
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message `feat(ai): add find_cells_by_population_range tool`
      + 1-2 line body.
