# Tasks 213 — `find_cells_by_precipitation_range`

- [ ] Implement `src/ai/tools/find-cells-by-precipitation-range.ts`
  - [ ] Export constants `DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT`
        (10000), `MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT` (100000),
        `MIN_PRECIPITATION` (0), `MAX_PRECIPITATION` (255).
  - [ ] `findCellsByPrecipitationRangeInPack(pack, grid, min, max, limit)`
        pure collector — resolves pack cell → grid cell via `pack.cells.g`
        and reads `grid.cells.prec`.
  - [ ] `FindCellsByPrecipitationRangeRuntime` interface +
        `defaultFindCellsByPrecipitationRangeRuntime` that pulls `pack` /
        `grid` from globals.
  - [ ] `createFindCellsByPrecipitationRangeTool(runtime?)` factory +
        `findCellsByPrecipitationRangeTool` singleton.
  - [ ] Runtime validation for `min`, `max`, `limit`.
  - [ ] Map `"not-ready"` → `errorResult`.
- [ ] Write `src/ai/tools/find-cells-by-precipitation-range.test.ts` with
      three describe blocks:
  - [ ] Pure collector (mid-range, inclusive boundaries, single value,
        full range, empty, limit/count, not-ready × pack/cells/g/grid/prec).
  - [ ] Tool surface (happy path, missing/invalid min/max, min>max, limit,
        not-ready, default limit, schema shape, constants).
  - [ ] `defaultFindCellsByPrecipitationRangeRuntime` integration (stub
        `globalThis.pack` + `globalThis.grid`, assert via
        `as unknown as { pack?: unknown; grid?: unknown }`).
- [ ] Register `findCellsByPrecipitationRangeTool` in `src/ai/index.ts`:
  - [ ] Import next to `findCellsByHeightRangeTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findCellsByPrecipitationRangeTool)` in
        `buildDefaultRegistry` next to height-range registration.
- [ ] Add README_AI.md row near `find_cells_by_height_range`:
  - [ ] Description includes `min`, `max`, `limit`, error modes, typical
        usage, and the pack-cell → grid-cell indirection via
        `pack.cells.g`.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API key'
        below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass (new tests included).
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message `feat(ai): add find_cells_by_precipitation_range tool`
      + 1-2 line body.
