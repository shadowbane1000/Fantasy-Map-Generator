# Tasks — Plan 230: `find_adjacent_entities`

## 1. Implementation
- [ ] Write `src/ai/tools/find-adjacent-entities.ts`:
  - [ ] `AdjacentEntityType` union + `ADJACENT_ENTITY_TYPES` array.
  - [ ] `DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT` = 1000, `MAX_...` = 100000.
  - [ ] `PackLike` (cells.{i, c, state, province, culture, religion, biome} + {states, provinces, cultures, religions}) + `BiomesDataLike`.
  - [ ] `getCollection(pack, type)` — returns the relevant entity array (undefined for biome).
  - [ ] `getCellField(pack, type)` — returns the matching `pack.cells.<field>`.
  - [ ] `resolveSource(...)` — uses `findEntityByRef` for 4 types, `findBiomeByRef` for biome; returns `{i, name}` or `null`.
  - [ ] `findAdjacentEntitiesInPack(biomesData, pack, type, ref, includeNeutrals, limit)` — pure collector. Returns `FindAdjacentEntitiesHit | "not-ready" | "unknown-entity"`.
    - [ ] Guards `pack`, `pack.cells.i`, `pack.cells.c`, field.
    - [ ] Iterates cells, neighbor-scans via `cells.c`, dedupes adjacent ids via `Set<number>`.
    - [ ] Skips id === source id; skips id === 0 when `!includeNeutrals`.
    - [ ] Resolves each adjacent id to `{i, name}` (via collection / biomesData), drops unresolvable ids silently.
    - [ ] Sorts adjacent array by `i` ascending for deterministic output.
    - [ ] `count` = resolved adjacent set size; truncates `adjacent` to `limit`.
  - [ ] `defaultFindAdjacentEntitiesRuntime` — reads `getPack` + `getGlobal("biomesData")`.
  - [ ] `parseEntityType(value)` — case-insensitive, returns typed union or null.
  - [ ] `parseEntityRef(value, type)` — for `biome`, uses non-negative integer rule; for others, uses positive integer rule (reuse `parseEntityRef` helper).
  - [ ] `parseIncludeNeutrals(value)` — undefined → false; boolean → passthrough; else error.
  - [ ] `parseLimit(value)` — default 1000, validate `[1, 100000]`.
  - [ ] `createFindAdjacentEntitiesTool(runtime)` + `findAdjacentEntitiesTool` singleton.
- [ ] Register in `src/ai/index.ts`:
  - [ ] `import { findAdjacentEntitiesTool } from "./tools/find-adjacent-entities";` (alphabetical with `findCellsByBiomeTool` area).
  - [ ] Re-export block for types / helpers (below the `find-cells-by-biome` re-export).
  - [ ] `registry.register(findAdjacentEntitiesTool);` after `findCellsByBiomeTool`.
- [ ] Add README_AI.md row below `get_entity_cells` — must include API-key note and example prompts.

## 2. Tests (`find-adjacent-entities.test.ts`)
- [ ] Fake pack helper with:
  - cells.i = [0..7]
  - cells.c (neighbor graph — explicit)
  - cells.state, .province, .culture, .religion, .biome
  - states, provinces, cultures, religions arrays (with 0-placeholder + `removed` slots)
  - biomesData fake `{i, name}`
- [ ] Pure-collector block (`findAdjacentEntitiesInPack`):
  - [ ] returns adjacent states for a numeric id (sorted ascending, deduped)
  - [ ] resolves source by case-insensitive name / fullName
  - [ ] province and culture and religion and biome parallels
  - [ ] `include_neutrals=false` drops id 0 from result
  - [ ] `include_neutrals=true` includes id 0 when present + resolves "Neutrals"/"Wildlands"/"No religion" name
  - [ ] `limit` truncates `adjacent` but keeps full `count`
  - [ ] returns `"unknown-entity"` for removed / unknown ref / id-0 placeholder (non-biome types)
  - [ ] returns `"not-ready"` for missing pack / missing cells / missing cells.c
  - [ ] silently skips adjacent ids that don't resolve to a live entity
- [ ] Tool-surface block (`createFindAdjacentEntitiesTool(realRuntime)`):
  - [ ] ok=true with `adjacent` array and `count`
  - [ ] entity_type case-insensitive (STATE, Province, Religion, Biome)
  - [ ] rejects invalid entity_type
  - [ ] rejects missing / invalid entity
  - [ ] rejects invalid include_neutrals (non-boolean)
  - [ ] rejects invalid limit
  - [ ] 'not-ready' surfaces as structured error
  - [ ] 'unknown-entity' surfaces as structured error (per type)
  - [ ] schema exposes required `entity_type`, `entity`; optional `include_neutrals`, `limit`
- [ ] Integration block (`defaultFindAdjacentEntitiesRuntime`):
  - [ ] sets `globalThis.pack` + `globalThis.biomesData` in beforeEach, restores in afterEach
  - [ ] state type happy path
  - [ ] biome type happy path via default runtime
  - [ ] 'not-ready' surfaced when pack missing

## 3. Verification
- [ ] `npm run build` succeeds
- [ ] `npm test` — all pass (count > baseline 3737)
- [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors)

## 4. Commit
- [ ] Stage only: `src/ai/tools/find-adjacent-entities.ts`, `src/ai/tools/find-adjacent-entities.test.ts`, `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_230.md`, `aiplans/tasks_230.md`.
- [ ] Title: `feat(ai): add find_adjacent_entities tool`
