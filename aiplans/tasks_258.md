# Tasks 258: `get_biome_distribution`

- [ ] 1. Study `list-biomes.ts`, `get-biome-info.ts`,
  `find-cells-by-biome.ts`, `get-population-stats.ts`, and the shared
  helpers in `_shared/`.
- [ ] 2. Create `src/ai/tools/get-biome-distribution.ts`:
  - Types: `BiomeDistributionEntry`, `BiomeDistributionPayload`,
    `BiomeDistributionResult`, `BiomeDistributionBiomesData`,
    `BiomeDistributionPackLike`, `BiomeDistributionRuntime`.
  - `readBiomeDistributionFromPack(biomesData, pack, includeRemoved)`
    pure aggregator:
    - Guard: `biomesData?.i` must be an array; `pack?.cells?.biome`
      must exist — else `"not-ready"`.
    - Single-pass `Map<number, { cellsCount, area }>` keyed by biome
      id built from `pack.cells.biome` + `pack.cells.area`.
    - Single-pass `Map<number, number>` burg tally by walking
      `pack.burgs`, skipping index-0 placeholder and `removed: true`.
    - Iterate biomesData rows; skip `name === "removed"` when
      `includeRemoved` is false.
    - Compute `percentage = round2(cells_count / total_cells * 100)`
      (0 when `total_cells === 0`).
    - Sort entries by `cells_count` desc (stable on `i` ascending).
  - `defaultBiomeDistributionRuntime` reading `biomesData` / `pack` via
    `getGlobal` / `getPack`.
  - `createGetBiomeDistributionTool(runtime)` + default
    `getBiomeDistributionTool` export.
  - Input schema: `{ type: "object", properties: { include_removed:
    { type: "boolean", description: "..." } } }`, no required.
  - Description: long, single paragraph, references `list_biomes`,
    `get_biome_info`, `get_population_stats`. Ends with "Read-only;
    requires an Anthropic API key (see 'Getting an API key' below)."
- [ ] 3. Create `src/ai/tools/get-biome-distribution.test.ts`:
  - Fake biomesData (Marine, Hot desert, Grassland, removed) and pack
    (6 cells, 6 burgs with one placeholder + one removed). Use
    `as unknown as { ... }` casts around globals in the integration
    block.
  - Pure aggregator suite: happy path (counts / area / burgs),
    percentages sum to ~100, descending sort, `include_removed` flag
    branches, zero-cell pack, missing biomesData → `"not-ready"`,
    missing cells → `"not-ready"`.
  - Tool-surface suite: default invocation, boolean `include_removed`,
    non-boolean rejected with descriptive error, `not-ready` surfaced,
    schema exports the expected shape.
  - Default runtime integration block: swap `globalThis.biomesData` /
    `globalThis.pack`, assert happy + missing paths.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import `getBiomeDistributionTool` near the existing
    `getBiomeInfoTool` import (alphabetical).
  - Re-export the types / factory / pure / default-runtime / default
    tool block next to the `get-biome-info` re-exports.
  - `registry.register(getBiomeDistributionTool)` near
    `registry.register(getBiomeInfoTool)`.
- [ ] 5. Add README_AI.md row immediately after the `get_biome_info`
  row, mentioning API key requirement + example prompts.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match
  baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_biome_distribution tool`.
