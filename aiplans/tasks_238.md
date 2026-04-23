# Tasks 238 — `find_cells_by_feature`

1. Write `src/ai/tools/find-cells-by-feature.ts`:
   - `DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT = 10000`, `MAX_FIND_CELLS_BY_FEATURE_LIMIT = 100000`.
   - `FeaturePackLike` shape with `features` array and `cells.f` typed-array.
   - `findFeatureCellsInPack(pack, featureId, limit)` pure collector returning hit / "not-ready" / "not-found".
   - `FindCellsByFeatureRuntime` + `defaultFindCellsByFeatureRuntime` using `getPack`.
   - `parseFeatureRef` (integer >= 1), `parseLimit` (1..MAX, default DEFAULT).
   - `createFindCellsByFeatureTool(runtime)` that returns a `Tool` with name `find_cells_by_feature`, description mirroring the biome analog and marker-oriented language, input schema declaring `feature` required integer + optional `limit`.
   - Export `findCellsByFeatureTool` default singleton.

2. Write `src/ai/tools/find-cells-by-feature.test.ts`:
   - Pure collector: id 1 happy path, id 2 ocean (name null), id 3 lake, 0 matches, truncation + count.
   - Not-found: id 0 placeholder, negative id, out-of-range id, empty slot (undefined).
   - Not-ready: pack undefined, features missing, cells.f missing.
   - Tool surface: happy path, limit truncation, invalid feature (non-int, missing, null, negative, 0), invalid limit, not-ready/not-found surfacing, default limit applied.
   - `defaultFindCellsByFeatureRuntime` integration block with beforeEach/afterEach setting globalThis.pack.
   - Use `as unknown as { ... }` casts on fixtures.

3. Register in `src/ai/index.ts`:
   - Import `findCellsByFeatureTool` next to the biome one.
   - Add export block mirroring the biome export block.
   - Call `registry.register(findCellsByFeatureTool)` after `findCellsByBiomeTool`.

4. Add `README_AI.md` row directly after the `find_cells_by_biome` row, with description and example prompts. Include the "Requires an Anthropic API key (see 'Getting an API key' below)." sentence.

5. Run `npm run lint` — must match baseline (7 warnings / 1 info / 0 errors).
6. Run `npm run build` — must succeed.
7. Run `npm test` — all must pass.
8. Commit staged specific files with message `feat(ai): add find_cells_by_feature tool` + short body.
