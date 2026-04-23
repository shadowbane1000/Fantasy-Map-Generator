# Plan 233 — get_entity_centroid AI tool

## Goal
Add a read-only `get_entity_centroid` tool that returns the
**center-of-mass** (mean of all cell centroids) of a state / province /
culture / religion / biome.

## Why
`get_entity_cells` returns the cell list; a caller can compute the bbox
midpoint itself (eventual `get_entity_bbox`) but the bbox midpoint is
biased by the entity's shape — a long coastline drags it offshore. The
**centroid** (arithmetic mean of every member cell's `p[k] = [x, y]`)
is a better "typical center" for labeling, marker placement, navigation
aiming, or distance queries.

## Data source
- `pack.cells.p` — `[x, y]` pair per packed cell (centroid coords, in
  SVG pixel space — same as `find_cell_at_coords` uses).
- `pack.cells.state | province | culture | religion | biome` — per-cell
  assignment fields.
- Entity resolution:
  - `state` / `province` / `culture` / `religion` — shared
    `findEntityByRef` (skips index-0 placeholder and `removed: true`).
  - `biome` — `findBiomeByRef` from `rename-biome` (skips `"removed"`
    sentinel).
- Reuses `AdjacentEntityType` / `ADJACENT_ENTITY_TYPES` from
  `find-adjacent-entities` for the 5-domain enum — no duplicate exports.

## Algorithm
1. Resolve the entity → `{ i, name }` (or bail with `unknown-entity`).
2. `field = pack.cells.<entity_field>`, `target = entity.i`,
   `p = pack.cells.p`.
3. Walk cells `k` from 0..pack.cells.i.length; when `field[k] === target`
   and `p[k]` exists, accumulate `sum_x += p[k][0]`,
   `sum_y += p[k][1]`, `count++`.
4. If `count === 0`, `centroid = null`.
   Else `centroid = { x: sum_x/count, y: sum_y/count }`.

Edge cases:
- No cells assigned to the resolved entity → `centroid: null`,
  `cells_count: 0`, still `ok: true`.
- Missing `pack.cells.p[k]`: the cell is skipped (doesn't contribute to
  sum or count — guards against malformed packs).
- Missing `pack.cells.<field>`: treated as zero-cell case (`centroid:
  null`, `cells_count: 0`).

## Tool shape
- Name: `get_entity_centroid`.
- Required:
  - `entity_type` — string, case-insensitive; one of `state`, `province`,
    `culture`, `religion`, `biome`.
  - `entity` — positive integer id OR case-insensitive name (biome
    accepts `0` = Marine).
- No optional params (no `limit` — output is fixed-size).
- Output:
  `{ ok, entity_type, i, name, centroid: { x, y } | null, cells_count }`.

## Runtime seam
- `GetEntityCentroidRuntime { compute(type, ref): Result }`.
- `defaultGetEntityCentroidRuntime.compute` delegates to
  `computeEntityCentroid(getPack<PackLike>(),
  getGlobal<BiomesDataLike>("biomesData"), type, ref)`.
- Pure collector result union:
  `{ i, name, centroid: {x,y} | null, cellsCount } | "not-ready" |
  "unknown-entity"`.

## Validation
- `entity_type` missing / not string / not in 5-enum →
  `errorResult("entity_type must be one of ...")`.
- `entity` — for state / province / culture / religion use
  `parseEntityRef` (positive integer id OR non-empty string). For biome
  accept `id >= 0` (Marine = 0 valid) or non-empty string — same
  pattern as `find-adjacent-entities.parseRef`.
- Un-resolvable ref → `errorResult("Could not resolve <type> <ref>.")`.
- Missing pack / missing `pack.cells.i` → `not-ready`.

## Response shape
```
{ ok: true, entity_type: "state", i: 3, name: "Altaria",
  centroid: { x: 123.4, y: 56.7 }, cells_count: 12 }
```
Or when no cells:
```
{ ok: true, entity_type: "state", i: 3, name: "Altaria",
  centroid: null, cells_count: 0 }
```

## Testing
Pattern of `get-entity-cells.test.ts` + `find-adjacent-entities.test.ts`.

- Pure collector:
  - Centroid for a state with hand-crafted cell coords (verify exact
    mean).
  - Same for province / culture / religion / biome.
  - Biome domain uses `biomesData` for resolution.
  - No-cells case → `centroid: null`, `cells_count: 0`.
  - Missing `pack.cells.<field>` → null centroid, 0 count.
  - Missing `pack.cells.p[k]` entries are skipped.
  - `not-ready` on missing pack / missing `pack.cells.i`.
  - `unknown-entity` on retired state, unknown name, index-0 placeholder
    (for non-biome), retired biome slot, unknown biome name.

- Tool surface:
  - ok payload for `{type, entity: id}` and `{type, entity: name}`.
  - Case-insensitive `entity_type`.
  - Rejects unknown `entity_type`.
  - Rejects missing / invalid `entity` (separate message for biome's
    non-negative rule).
  - Biome accepts `entity: 0` (Marine).
  - Non-biome rejects `entity: 0`.
  - Surfaces `not-ready` + `unknown-entity` as structured errors.
  - Exports `getEntityCentroidTool` with expected schema (required
    `[entity_type, entity]`).

- `defaultGetEntityCentroidRuntime` integration block:
  - Stubs `globalThis.pack` + `globalThis.biomesData` via
    `as unknown as { ... }` in `beforeEach`; restores in `afterEach`.
  - Exercises default path (state + biome).
  - Confirms `not-ready` surfaces when pack is missing.

## Wiring
- Register in `src/ai/index.ts` immediately after
  `findAdjacentEntitiesTool` (or near the `get_entity_cells` group).
- Re-export: `createGetEntityCentroidTool`,
  `defaultGetEntityCentroidRuntime`, `GetEntityCentroidRuntime`,
  `CollectEntityCentroidResult`, `EntityCentroidHit`, and
  `computeEntityCentroid`. Do **not** duplicate
  `ADJACENT_ENTITY_TYPES` / `AdjacentEntityType` — import from
  `find-adjacent-entities`.
- README_AI.md: add row near `get_entity_cells` with API-key note.

## Out of scope
- Bounding-box midpoint (different tool: `get_entity_bbox`, future).
- Weighted centroid (e.g. weighted by area or population).
- Cross-domain centroid (intersection of two entities).
- Writing or mutating any state.

## Verify
- `npm run build` — clean.
- `npm test` — baseline 3816 → 3816 + new cases pass.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
