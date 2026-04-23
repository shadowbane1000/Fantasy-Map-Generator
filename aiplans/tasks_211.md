# Tasks 211 — `find_cells_by_height_range`

- [ ] Implement `src/ai/tools/find-cells-by-height-range.ts`
  - [ ] Export constants `DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT`
        (10000), `MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT` (100000),
        `MIN_HEIGHT` (0), `MAX_HEIGHT` (100).
  - [ ] `findCellsByHeightRangeInPack(pack, min, max, limit)` pure collector.
  - [ ] `FindCellsByHeightRangeRuntime` interface +
        `defaultFindCellsByHeightRangeRuntime`.
  - [ ] `createFindCellsByHeightRangeTool(runtime?)` factory +
        `findCellsByHeightRangeTool` singleton.
  - [ ] Runtime validation for `min`, `max`, `limit`.
  - [ ] Map `"not-ready"` → `errorResult`.
- [ ] Write `src/ai/tools/find-cells-by-height-range.test.ts` with three
      describe blocks:
  - [ ] Pure collector (mid-range, inclusive boundaries, single value, full
        range, empty, limit/count, not-ready).
  - [ ] Tool surface (happy path, missing/invalid min/max, min>max, limit,
        not-ready, default limit, schema shape, constants).
  - [ ] `defaultFindCellsByHeightRangeRuntime` integration (stub globals,
        assert via `as unknown as { pack?: unknown }`).
- [ ] Register `findCellsByHeightRangeTool` in `src/ai/index.ts`:
  - [ ] Import next to `findCellsByBiomeTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findCellsByHeightRangeTool)` in
        `buildDefaultRegistry`.
- [ ] Add README_AI.md row near `find_cells_by_biome`:
  - [ ] Description includes `min`, `max`, `limit`, error modes,
        typical usage.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API key'
        below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass (new tests included).
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message `feat(ai): add find_cells_by_height_range tool` +
      1-2 line body.
