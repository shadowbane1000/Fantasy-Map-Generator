# Tasks 149 — `set_biome_cost`

## Pre-flight

- [x] Confirm worktree, merge master --ff-only
- [x] Study `public/modules/ui/biomes-editor.js` — cost is NOT UI-exposed; only default-seeded at 50 on custom-biome create
- [x] Study `src/modules/biomes.ts` — default cost array (13 values, Marine=10 .. Glacier=5000)
- [x] Study `src/ai/tools/set-biome-habitability.ts` + test — closest analog (minus recalc / DOM)
- [x] Study `src/ai/tools/set-biome-color.ts` + test — parallel pattern
- [x] Study `src/ai/tools/rename-biome.ts` — `findBiomeByRef` helper we reuse
- [x] Confirm baseline: 7 warnings / 1 info / 0 errors

## Implementation

- [ ] `src/ai/tools/set-biome-cost.ts`
  - [ ] `MIN_COST = 0`, `MAX_COST = 100000`
  - [ ] `BiomeCostRef` = `{ i, name, previousCost }`
  - [ ] `BiomeCostRuntime` with `find(ref) -> BiomeCostRef | null` and `apply(id, value)`
  - [ ] `BiomesDataLike` = `{ i?: number[], name?: string[], cost?: number[] }`
  - [ ] `defaultBiomeCostRuntime`:
    - [ ] `find` reuses `findBiomeByRef` and reads `biomesData.cost?.[k]`
    - [ ] `apply` writes `biomesData.cost[res.k] = value`
  - [ ] `isValidRef` mirror
  - [ ] `createSetBiomeCostTool(runtime)` factory
    - [ ] schema: `biome` (int|string), `cost` (integer with min/max)
    - [ ] description calls out: (a) traversal cost used by states/cultures/religions
          expansion, (b) no retroactive effect — only influences the next
          regeneration, (c) biome match semantics (id 0 = Marine, case-insensitive
          name, removed skipped)
    - [ ] `execute`: validate → find → apply → okResult `{ ok, i, name, previousCost, cost }`
  - [ ] Export `setBiomeCostTool` default instance

- [ ] `src/ai/tools/set-biome-cost.test.ts`
  - [ ] Seam tests (mock runtime): numeric id / case-insensitive name /
        boundary 0 and 100000 / invalid refs / invalid costs / unknown biome /
        apply throws
  - [ ] Integration block (defaultBiomeCostRuntime):
    - [ ] `beforeEach` installs `globalThis.biomesData` with `i`, `name`
          (including one `"removed"` slot), `cost`
    - [ ] `afterEach` restores previous value
    - [ ] Updates cost at correct `k`
    - [ ] Refuses to update a `"removed"` slot
    - [ ] Finds by case-insensitive name
  - [ ] Use `as unknown as { ... }` casts for globalThis reassignment

- [ ] `src/ai/index.ts`
  - [ ] Import `setBiomeCostTool`
  - [ ] Re-export `{ createSetBiomeCostTool, setBiomeCostTool }` block
  - [ ] Register in `buildDefaultRegistry` next to `setBiomeHabitabilityTool`

- [ ] `README_AI.md`
  - [ ] Add row after `set_biome_habitability` / before `remove_biome`
  - [ ] Cite `biomesData.cost[k]` path, integer [0, 100000] bounds, no retroactive effect

## Verification

- [ ] `npm run build` succeeds
- [ ] `npm test` all pass (test count increases by the new file's count)
- [ ] `npm run lint 2>&1 | tail -5` matches baseline (7 warnings / 1 info / 0 errors)

## Commit

- [ ] `feat(ai): add set_biome_cost tool` + 1-2 line body
- [ ] Stage specific files (no `git add .`)
