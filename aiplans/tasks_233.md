# Tasks 233 — get_entity_centroid

## Study
- [x] Read `src/ai/tools/get-entity-cells.ts` + test
- [x] Read `src/ai/tools/find-adjacent-entities.ts` (reuse
      `ADJACENT_ENTITY_TYPES`, `AdjacentEntityType`)
- [x] Check `src/types/PackedGraph.ts` — `pack.cells.p: [x,y][]`
- [x] Read `src/ai/tools/_shared/index.ts` helpers
- [x] Read `src/ai/tools/rename-biome.ts` — `findBiomeByRef`

## Implement
- [ ] Create `src/ai/tools/get-entity-centroid.ts`:
  - [ ] Import `ADJACENT_ENTITY_TYPES`, `AdjacentEntityType` from
        `./find-adjacent-entities`
  - [ ] Import `findBiomeByRef` from `./rename-biome`
  - [ ] Import shared helpers (`errorResult`, `findEntityByRef`,
        `getGlobal`, `getPack`, `okResult`, `parseEntityRef`)
  - [ ] Define `PackLike` (cells.i, cells.p, cells.state/province/culture/
        religion/biome; entity collections)
  - [ ] Define `BiomesDataLike` (`i?: number[]`, `name?: string[]`)
  - [ ] Define `EntityCentroidHit = { i, name, centroid: {x,y}|null,
        cellsCount }`
  - [ ] Define `CollectEntityCentroidResult` union
  - [ ] `getCollection(pack, type)` + `getCellField(pack, type)` helpers
  - [ ] `resolveEntity(pack, biomesData, type, ref)` — handles biome
        separately (findBiomeByRef) vs. findEntityByRef
  - [ ] `computeEntityCentroid(pack, biomesData, type, ref)` pure collector
  - [ ] `GetEntityCentroidRuntime`, `defaultGetEntityCentroidRuntime`
  - [ ] `parseEntityType` (matching pattern)
  - [ ] `parseRef` (biome accepts 0; others via parseEntityRef)
  - [ ] `createGetEntityCentroidTool(runtime)` with schema + execute
  - [ ] Export `getEntityCentroidTool`

- [ ] Create `src/ai/tools/get-entity-centroid.test.ts`:
  - [ ] FakePack builder with `p: [x,y][]` and
        state/province/culture/religion/biome fields
  - [ ] `asPack` helper using `as unknown as Parameters<...>[0]`
  - [ ] Pure collector tests:
    - [ ] Centroid for a state (exact mean calc)
    - [ ] Province / culture / religion / biome
    - [ ] Case-insensitive name
    - [ ] No-cells → centroid null
    - [ ] Missing field → null + count 0
    - [ ] Missing p[k] entries skipped
    - [ ] not-ready on missing pack / missing cells.i
    - [ ] unknown-entity for retired state, unknown name, id 0 placeholder
    - [ ] Biome id 0 (Marine) resolves OK
    - [ ] Biome "removed" slot returns unknown-entity
  - [ ] Tool surface:
    - [ ] ok payload by id + by name
    - [ ] Case-insensitive entity_type
    - [ ] Rejects unknown entity_type
    - [ ] Rejects missing/invalid entity for non-biome
    - [ ] Rejects negative biome id; accepts 0
    - [ ] not-ready + unknown-entity structured errors
    - [ ] Schema: required `[entity_type, entity]`
  - [ ] `defaultGetEntityCentroidRuntime` integration block:
    - [ ] beforeEach stubs `globalThis.pack` + `globalThis.biomesData`
    - [ ] afterEach restores
    - [ ] Happy path (state)
    - [ ] Happy path (biome with biomesData)
    - [ ] not-ready when pack missing

## Wire
- [ ] `src/ai/index.ts`:
  - [ ] Import `getEntityCentroidTool` near `getEntityCellsTool`
  - [ ] Export in the main re-export surface (alphabetized near
        `getEntityCellsTool`)
  - [ ] `registry.register(getEntityCentroidTool)` near its peer

## Docs
- [ ] README_AI.md: add row immediately after `get_entity_cells` (row
      47) with full description + API-key note + example prompts

## Verify
- [ ] `npm run build` clean
- [ ] `npm test` — all pass, count 3816 → 3816 + new cases
- [ ] `npm run lint` — 7 warnings / 1 info / 0 errors (baseline)

## Commit
- [ ] Stage:
      `src/ai/tools/get-entity-centroid.ts`,
      `src/ai/tools/get-entity-centroid.test.ts`,
      `src/ai/index.ts`, `README_AI.md`,
      `aiplans/plan_233.md`, `aiplans/tasks_233.md`
- [ ] `feat(ai): add get_entity_centroid tool` with 1-2 line body
