# Tasks 188 — `get_biome_info`

- [ ] Confirm in worktree, master up-to-date (done: merged local master
      into worktree branch; baseline test count 2708, lint 7w/1i/0e).
- [ ] Study reference files:
  - [x] `src/ai/tools/list-biomes.ts` (shape of biomesData + populationRate).
  - [x] `src/ai/tools/rename-biome.ts` (`findBiomeByRef` helper).
  - [x] `src/ai/tools/set-biome-color.ts` / `set-biome-cost.ts` /
        `set-biome-habitability.ts` / `set-biome-icons.ts` (ref
        resolution pattern).
  - [x] `src/ai/tools/get-state-info.ts` + test (info-tool structure).
  - [x] `src/ai/tools/_shared/pack-types.ts` (no biome raw type — biome
        id lives on `pack.cells.biome`).
  - [x] `src/modules/biomes.ts` (defaults for sanity-checking field
        shapes).
- [ ] Write `aiplans/plan_188.md` + `aiplans/tasks_188.md`.
- [ ] Implement `src/ai/tools/get-biome-info.ts`:
  - [ ] Export `BiomeInfo` / `ReadBiomeInfoResult` / `BiomeInfoRuntime`
        / `BiomeInfoPackLike`.
  - [ ] Export `readBiomeInfoFromPack(biomesData, pack, populationRate,
        ref)`.
  - [ ] Export `defaultBiomeInfoRuntime` wired to
        `globalThis.biomesData` + `getPack<BiomeInfoPackLike>()` +
        `populationRate`.
  - [ ] Export `createGetBiomeInfoTool(runtime?)` and
        `getBiomeInfoTool` (default).
  - [ ] Use existing shared helpers: `errorResult`, `okResult`,
        `getGlobal`, `getPack`, `findBiomeByRef`.
- [ ] Implement `src/ai/tools/get-biome-info.test.ts`:
  - [ ] Build a fake biomesData + pack + populationRate.
  - [ ] Cover: numeric ref (0 + positive), string ref (case-insensitive),
        removed sentinel rejection, unknown ref, not-ready, icons
        pass-through (always flat array), color default, area/pop
        aggregation, burgs_count filters removed / placeholder.
  - [ ] Integration block for `defaultBiomeInfoRuntime` using
        `as unknown as { ... }` casts on globalThis.
- [ ] Wire `src/ai/index.ts`:
  - [ ] Import near other `get-*-info` imports.
  - [ ] Re-export `createGetBiomeInfoTool`, `defaultBiomeInfoRuntime`,
        `getBiomeInfoTool`, `readBiomeInfoFromPack`, `BiomeInfo`,
        `BiomeInfoRuntime` alongside `get-state-info` exports.
  - [ ] `registry.register(getBiomeInfoTool);` next to other
        get-info registrations.
- [ ] Add `get_biome_info` row to `README_AI.md` table (near
      `get_state_info` / `get_culture_info` / `get_river_info`).
- [ ] `npm run build` → succeeds.
- [ ] `npm test` → all pass, count = 2708 + new.
- [ ] `npm run lint` → matches 7w/1i/0e baseline.
- [ ] Commit with `feat(ai): add get_biome_info tool`.
