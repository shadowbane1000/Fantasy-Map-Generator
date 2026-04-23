# Plan 230 — `find_adjacent_entities` AI Tool

## Goal
Add a generic AI tool that, given a source entity (state / province / culture / religion / biome), returns every *distinct* entity of the same type whose cells share at least one border with the source entity's cells. Single tool, `entity_type`-dispatched, mirroring the shape of `get_entity_cells` (same multi-domain pattern) and `find_cells_by_biome` (for biome resolution).

## Design

### Shape
Tool name: `find_adjacent_entities`
Inputs:
- `entity_type` (required string, case-insensitive) — `"state" | "province" | "culture" | "religion" | "biome"`.
- `entity` (required) — positive integer id (or non-negative for biome) OR case-insensitive name / fullName. Resolution reuses:
  - `findEntityByRef` (for state / province / culture / religion; skips the 0-placeholder and `removed: true` entries).
  - `findBiomeByRef` (for biome; 0 = Marine is valid, skips `"removed"` sentinel).
- `include_neutrals` (optional boolean, default `false`) — when `true`, include id-0 (Neutrals / Wildlands / No-religion) in the adjacent set. Biomes never have a "neutral 0" concept; the flag is still accepted but effectively a no-op there (0 is just the Marine biome and always includes).
- `limit` (optional integer in `[1, 100000]`, default `1000`) — caps the `adjacent` array. `count` reports the unlimited total.

Returns:
```
{
  ok: true,
  entity_type: "state",
  i: <source id>,
  name: <source name>,
  adjacent: [{i, name}, ...],
  count: <full unlimited total>
}
```

Errors:
- invalid `entity_type` (not in the 5 allowed values)
- missing / unresolvable `entity`
- `include_neutrals` not a boolean
- `limit` out-of-range
- un-generated map (`"not-ready"`)
- unresolved source entity (`"unknown-entity"`)

### Algorithm (pure collector)
```
resolve source entity from ref -> {i: srcId, name}
get field = pack.cells.<state|province|culture|religion|biome>
get neighbors = pack.cells.c
for cellI in 0..cells.i.length:
  if field[cellI] !== srcId: continue
  for nbr in neighbors[cellI]:
    v = field[nbr]
    if v === srcId: continue
    if v === 0 && !include_neutrals: continue
    set.add(v)
// deduped ids -> resolve each to {i, name} (via same collection)
```

For entity_type "biome", id→name uses `biomesData.name[k]` where `biomesData.i[k] === id`, skipping `"removed"`.
For the others, the collection lookup uses the `pack.<states|provinces|cultures|religions>[i]` entry.

Neighbor resolution errors silently (malformed pack → ignored): if `pack.cells.c` or the field is missing, collector returns `"not-ready"`.

### Files
- `src/ai/tools/find-adjacent-entities.ts` — implementation with runtime seam.
- `src/ai/tools/find-adjacent-entities.test.ts` — Vitest with pure-collector, tool-surface, and `defaultRuntime` integration blocks covering all 5 types.
- `src/ai/index.ts` — import + re-export + `registry.register`.
- `README_AI.md` — new row below `get_entity_cells`.

### Constants / exports
- `ADJACENT_ENTITY_TYPES` (readonly union array).
- `DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT = 1000`.
- `MAX_FIND_ADJACENT_ENTITIES_LIMIT = 100000`.
- `AdjacentEntityType` — `"state" | "province" | "culture" | "religion" | "biome"`.
- `findAdjacentEntitiesInPack` (pure).
- `FindAdjacentEntitiesResult` / `FindAdjacentEntitiesHit` types.
- `FindAdjacentEntitiesRuntime` + `defaultFindAdjacentEntitiesRuntime`.
- `createFindAdjacentEntitiesTool` + `findAdjacentEntitiesTool`.

### Runtime seam
```
interface FindAdjacentEntitiesRuntime {
  collect(
    type: AdjacentEntityType,
    ref: number | string,
    includeNeutrals: boolean,
    limit: number,
  ): FindAdjacentEntitiesResult;
}
```
`defaultFindAdjacentEntitiesRuntime.collect` pulls `pack` and (for biome) `biomesData` from globals and delegates to `findAdjacentEntitiesInPack`.

### Read-only
No pack / DOM mutations. Mirrors `get_entity_cells` safety posture.

## Out of scope
- Returning the cells that form the boundary between pairs (would be a `find_border_cells` tool).
- Handling removed entities that happen to be referenced by cells (ids are resolved against live collection; ids that don't resolve are silently dropped so the adjacent list stays clean).
- Non-cell adjacency (e.g. diplomatic / religious adjacency graphs).
