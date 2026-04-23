# Plan 231 — find_cells_adjacent_to_entity AI tool

## Goal
Add a read-only `find_cells_adjacent_to_entity` tool that returns the
"border ring" of cells just **outside** a given state / province /
culture / religion / biome — i.e. every cell that neighbors at least
one cell inside the entity but is **not itself** part of the entity.

## Why
`get_entity_cells` (plan 208) and `find_cells_by_biome` already return
cells *inside* a territory. Many AI workflows want the complement:

- Audit where a state / province's borders run (for zones, defenses,
  frontiers, markers).
- Pick candidate cells for `add_marker` / `add_zone` along a culture's
  edge.
- Identify the cells another state owns along a shared border.
- Walk the frontier of a biome.

Doing this from the outside today requires `get_entity_cells` plus a
full Voronoi neighbor walk — something the tool can now do in one
call.

## Data source
- `pack.cells.c[i]` — plain `number[]` of neighbor cell indices for
  each packed cell (Voronoi adjacency).
- `pack.cells.state | province | culture | religion | biome` — the
  per-cell assignment field that defines entity membership.
- Entity resolution:
  - `state` / `province` / `culture` / `religion` — resolved via the
    same shared `findEntityByRef` pattern `get_entity_cells` uses
    (skips index-0 placeholder and `removed: true` entries).
  - `biome` — resolved via `findBiomeByRef` from `rename-biome`
    (skips the `"removed"` sentinel slot), matching
    `find_cells_by_biome`.

## Algorithm
1. Resolve the entity → `{ i, name }` (or bail with
   `unknown-entity` / `not-found`).
2. Let `field = pack.cells.<entity_field>` and `target = entity.i`.
3. Walk every cell `k` where `field[k] === target`.
4. For every neighbor `n` in `pack.cells.c[k]`, if `field[n] !== target`
   include `n` in the result set (deduplicated).
5. The result is a **sorted unique** array of border-ring cell ids,
   with `count` reporting the full unlimited total even when the
   returned array is capped by `limit`.

Edge cases:
- A cell with no neighbors or absent entry in `pack.cells.c`: skipped
  silently.
- Self-assignment is impossible by construction (we exclude
  `field[n] === target`).
- When the entity has zero cells, `cells: []`, `count: 0`, still
  `ok: true`.
- Domain unification: biome shares the same shape but its resolver is
  different, so the `i` / `name` we return always tracks the resolved
  entity regardless of domain.

## Tool shape
- Name: `find_cells_adjacent_to_entity`.
- Required: `entity_type` (case-insensitive one of `state`, `province`,
  `culture`, `religion`, `biome`) and `entity` (positive integer id OR
  case-insensitive name — plus `fullName` for states/provinces via
  `findEntityByRef`; biome resolves by `findBiomeByRef`).
- Optional: `limit` (integer in [1, 100000], default 10000). `count`
  reports full unlimited total.
- Output:
  `{ ok, entity_type, i, name, cells: number[], count }`.

## Runtime seam
- `FindCellsAdjacentToEntityRuntime { collect(type, ref, limit): CollectResult }`.
- `defaultFindCellsAdjacentToEntityRuntime` delegates to the pure
  collector
  `collectAdjacentCellsForEntity(getPack<PackLike>(), getGlobal<BiomesDataLike>("biomesData"), type, ref, limit)`.
- Pure collector returns `"not-ready" | "unknown-entity" | EntityCellsHit`
  where `EntityCellsHit = { i, name, cells, count }`.

## Validation
- `entity_type` missing / not string / not one of the 5 canonical values
  → `errorResult("entity_type must be one of ...")`.
- `entity` validated via `parseEntityRef` for non-biome domains (the
  same helper `get_entity_cells` uses — positive integer id OR
  non-empty string).
- For biome we accept `id >= 0` (Marine = 0 is valid), matching
  `find_cells_by_biome`.
- `limit` validated as integer in `[1, 100000]`; default 10000.
- Un-resolvable ref → `errorResult("Could not resolve <type> <ref>.")`.
- `not-ready` → error about waiting for `map:generated`.

## Response shape
```
{ ok: true, entity_type: "state", i: 3, name: "Altaria", cells: [...], count: N }
```

## Testing
Follow the `get-entity-cells.test.ts` + `find-cells-by-biome.test.ts`
patterns:

- Pure collector tests:
  - Border ring for a state (hand-crafted 8-cell graph), verifies the
    return is the distinct set of neighbors outside the entity.
  - Same for province / culture / religion by selecting a different
    field.
  - Biome domain — hand-crafted pack with `biome` field + `biomesData`.
  - Handles orphan entity (target has zero cells): returns empty.
  - Handles entity surrounded entirely by its own cells: returns empty.
  - Truncates `cells` at `limit`, preserves full `count`.
  - Deduplicates when multiple entity cells share the same outside
    neighbor.
  - `not-ready` on missing pack / missing `pack.cells.i` / missing
    `pack.cells.c` / missing biomesData (for biome domain).
  - `unknown-entity` on retired state, unknown name, index-0
    placeholder, retired biome slot, unknown biome name.

- Tool surface tests:
  - ok payload for `{entity_type, entity: id}` and
    `{entity_type, entity: name}`.
  - Accepts mixed-case `entity_type`.
  - Respects limit; reports count.
  - Rejects unknown `entity_type`.
  - Rejects missing / invalid `entity` (differentiated error for biome
    since `0` is valid there — handled by separate parse path).
  - Rejects invalid `limit`.
  - Surfaces `not-ready` and `unknown-entity` as structured errors.
  - Applies default limit when omitted.
  - Exports `findCellsAdjacentToEntityTool` with the expected schema.

- `defaultFindCellsAdjacentToEntityRuntime` integration block:
  - Stubs `globalThis.pack` + `globalThis.biomesData` via
    `as unknown as { ... }` casts in `beforeEach`; restores in
    `afterEach`.
  - Exercises the real default path (state + biome domains).
  - Confirms `not-ready` surfaces when pack is missing.

## Wiring
- Register in `src/ai/index.ts` immediately after `getEntityCellsTool`
  and re-export the standard set (`createFindCellsAdjacentToEntityTool`,
  `defaultFindCellsAdjacentToEntityRuntime`,
  `DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT`,
  `MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT`,
  `ADJACENT_ENTITY_TYPES`, and the types). Do **not** re-export
  shared constants (`ENTITY_TYPES`, `findBiomeByRef`) — those live in
  `get-entity-cells` / `rename-biome`.
- README_AI.md: add a row immediately below `get_entity_cells` with the
  API-key note.

## Out of scope
- Writing to any entity (read-only).
- Computing distance-N rings (only the direct 1-hop neighbor set).
- Cross-domain adjacency (e.g. "neighbors of state X that are in
  culture Y") — caller can intersect with `get_entity_cells` /
  `find_cells_by_biome`.

## Verify
- `npm run build` — clean.
- `npm test` — baseline 3737 → 3737 + new cases pass.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
