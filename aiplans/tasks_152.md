# Tasks 152 — `set_biome_icons_density`

## Pre-flight

- [x] Confirm worktree, merge master --ff-only
- [x] Study `public/modules/ui/biomes-editor.js` — `iconsDensity` is NOT UI-exposed; only default-seeded at 0 on custom-biome create. `regenerateIcons()` (line 325) calls `drawReliefIcons()` + toggles relief layer.
- [x] Study `src/modules/biomes.ts` — default `iconsDensity` array (13 values, Marine=0 .. Wetland=250)
- [x] Study `src/renderers/draw-relief-icons.ts` — renderer reads `biomesData.iconsDensity[biome]` in `placeBiomeIcons()` (line 32, 42, 44)
- [x] Study `src/ai/tools/set-biome-cost.ts` + test — closest analog (data-only integer setter)
- [x] Study `src/ai/tools/set-biome-habitability.ts` + test — analog with a best-effort recalc side-effect
- [x] Study `src/ai/tools/rename-biome.ts` — `findBiomeByRef` helper we reuse
- [x] Confirm baseline: 7 warnings / 1 info / 0 errors; 2007 tests in 164 files

## Implementation

- [ ] `src/ai/tools/set-biome-icons-density.ts`
  - [ ] `MIN_DENSITY = 0`, `MAX_DENSITY = 1000`
  - [ ] `BiomeIconsDensityRef` = `{ i, name, previousDensity }`
  - [ ] `BiomeIconsDensityRuntime` with `find(ref) -> BiomeIconsDensityRef | null` and `apply(id, value)`
  - [ ] `BiomesDataLike` = `{ i?: number[], name?: string[], iconsDensity?: number[] }`
  - [ ] `defaultBiomeIconsDensityRuntime`:
    - [ ] `find` reuses `findBiomeByRef` and reads `biomesData.iconsDensity?.[k]`
    - [ ] `apply` writes `biomesData.iconsDensity[res.k] = value`, then best-effort
          `drawReliefIcons()` in try/catch (mirror habitability pattern)
  - [ ] `isValidRef` mirror
  - [ ] `createSetBiomeIconsDensityTool(runtime)` factory
    - [ ] schema: `biome` (int|string), `density` (integer with min/max)
    - [ ] description calls out: (a) controls lowland biome relief icons count,
          (b) 0 = disable biome icons, (c) best-effort drawReliefIcons call,
          (d) biome match semantics (id 0 = Marine, case-insensitive name,
          removed skipped)
    - [ ] `execute`: validate → find → apply → okResult `{ ok, i, name, previousDensity, density }`
  - [ ] Export `setBiomeIconsDensityTool` default instance

- [ ] `src/ai/tools/set-biome-icons-density.test.ts`
  - [ ] Seam tests (mock runtime): numeric id / case-insensitive name /
        boundary 0 and 1000 / invalid refs / invalid densities / unknown biome /
        apply throws
  - [ ] Integration block (defaultBiomeIconsDensityRuntime):
    - [ ] `beforeEach` installs `globalThis.biomesData` with `i`, `name`
          (including one `"removed"` slot), `iconsDensity`
    - [ ] `beforeEach` installs `globalThis.drawReliefIcons = vi.fn()`
    - [ ] `afterEach` restores previous values
    - [ ] Updates density at correct `k`
    - [ ] Refuses to update a `"removed"` slot
    - [ ] Finds by case-insensitive name
    - [ ] Calls `drawReliefIcons` best-effort
    - [ ] Swallows `drawReliefIcons` throw (data still mutated)
    - [ ] Errors when biomesData is missing entirely
  - [ ] Use `as unknown as { ... }` casts for globalThis reassignment

- [ ] `src/ai/index.ts`
  - [ ] Import `setBiomeIconsDensityTool`
  - [ ] Re-export `{ createSetBiomeIconsDensityTool, setBiomeIconsDensityTool }` block
  - [ ] Register in `buildDefaultRegistry` next to `setBiomeCostTool`

- [ ] `README_AI.md`
  - [ ] Add row after `set_biome_cost` / before `remove_biome`
  - [ ] Cite `biomesData.iconsDensity[k]` path, integer [0, 1000] bounds,
        best-effort `drawReliefIcons()` call, 0 = disable

## Verification

- [ ] `npm run build` succeeds
- [ ] `npm test` all pass (test count increases by the new file's count)
- [ ] `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors)

## Commit

- [ ] `feat(ai): add set_biome_icons_density tool` + 1-2 line body
- [ ] Stage specific files (no `git add .`)
