# Tasks 208 — `find_cells_by_biome`

- [ ] Implement `src/ai/tools/find-cells-by-biome.ts`
  - [ ] Export constants `DEFAULT_FIND_CELLS_BY_BIOME_LIMIT`
        (10000), `MAX_FIND_CELLS_BY_BIOME_LIMIT` (100000).
  - [ ] `findBiomeCellsInPack(biomesData, pack, ref, limit)` pure collector.
  - [ ] `FindCellsByBiomeRuntime` interface + `defaultFindCellsByBiomeRuntime`.
  - [ ] `createFindCellsByBiomeTool(runtime?)` factory + `findCellsByBiomeTool`
        singleton.
  - [ ] Runtime validation for `biome` (id / name) and `limit`.
  - [ ] Map `"not-ready"` / `"not-found"` → `errorResult`.
- [ ] Write `src/ai/tools/find-cells-by-biome.test.ts` with three describe
      blocks:
  - [ ] Pure collector (id, name, limit/count, unknown, removed, not-ready).
  - [ ] Tool surface (happy path, error paths, schema shape).
  - [ ] `defaultFindCellsByBiomeRuntime` integration (stub globals, assert).
- [ ] Register `findCellsByBiomeTool` in `src/ai/index.ts`:
  - [ ] Import next to `getEntityCellsTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findCellsByBiomeTool)` in `buildDefaultRegistry`.
- [ ] Add README_AI.md row near `get_entity_cells`:
  - [ ] Description includes `biome`, `limit`, error modes, typical usage.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API key'
        below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass (new tests included).
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message `feat(ai): add find_cells_by_biome tool` + 1-2 line
      body.
