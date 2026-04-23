# Plan 232 — get_entity_bbox AI tool

## Goal
Add a read-only `get_entity_bbox` tool that computes the axis-aligned
bounding box of a given state / province / culture / religion / biome
by walking the cells assigned to it and finding the min / max
coordinates of their centroids in `pack.cells.p`.

## Why
Bounding boxes are the common spatial primitive for:

- Camera focus / fit-to-extent ("zoom to Altaria").
- Overlay placement (labels, frames, map scale rulers).
- Quick extent checks before other spatial queries (e.g. "is X inside
  the bbox of state Y?").
- AI reasoning about shape / size / concentration of a territory.

`get_entity_cells` returns the cell ids, but the AI still has to fetch
`get_cell_info` for each to recover coordinates. `get_entity_bbox`
collapses that into a single call.

## Data source
- `pack.cells.p[k]` — `[x, y]` centroid of cell `k` in map-space.
- `pack.cells.state | province | culture | religion | biome` — the
  per-cell assignment field.
- Entity resolution mirrors `find_adjacent_entities` /
  `find_cells_adjacent_to_entity`:
  - `state` / `province` / `culture` / `religion` → `findEntityByRef`
    (skips index-0 placeholder and `removed: true`).
  - `biome` → `findBiomeByRef` from `rename-biome` (skips the
    `"removed"` sentinel).

## Algorithm
1. Resolve the entity → `{ i, name }` (or bail with
   `"unknown-entity"` / `"not-ready"`).
2. Let `field = pack.cells.<entity_field>` and `target = entity.i`.
3. Iterate `k ∈ [0, cells.i.length)`. When `field[k] === target`:
   - Read `p = pack.cells.p[k]`; skip if missing / not a 2-length array
     of numbers.
   - Update `x_min = min(x_min, p[0])`, `x_max`, `y_min`, `y_max`.
   - `cells_count++`.
4. When `cells_count === 0`, return an empty bbox — `x_min`, `y_min`,
   `x_max`, `y_max`, `width`, `height`, `cx`, `cy` all `null`.
5. Otherwise:
   - `width = x_max - x_min`, `height = y_max - y_min`.
   - `cx = (x_min + x_max) / 2`, `cy = (y_min + y_max) / 2`.

## Tool shape
- Name: `get_entity_bbox`.
- Required: `entity_type` (case-insensitive one of `state`, `province`,
  `culture`, `religion`, `biome`) and `entity` (positive integer id OR
  case-insensitive name / fullName — for biome, non-negative integer id
  OR case-insensitive biome name).
- No optional args (read-only query, no pagination needed — bbox is a
  constant-size payload regardless of cell count).
- Output:
  ```
  {
    ok: true,
    entity_type: "state",
    i: 3,
    name: "Altaria",
    bbox: {
      x_min, y_min, x_max, y_max,
      width, height,
      cx, cy
    },
    cells_count: N
  }
  ```
  All numeric fields inside `bbox` are `null` when `cells_count === 0`.

## Runtime seam
- `GetEntityBboxRuntime { collect(type, ref): CollectEntityBboxResult }`.
- `defaultGetEntityBboxRuntime` delegates to the pure collector
  `collectEntityBbox(getPack<PackLike>(), getGlobal<BiomesDataLike>("biomesData"), type, ref)`.
- `CollectEntityBboxResult = EntityBboxHit | "not-ready" | "unknown-entity"`.
- `EntityBboxHit = { i, name, bbox: Bbox, cellsCount }`.
- `Bbox = { x_min, y_min, x_max, y_max, width, height, cx, cy }` where
  every field is `number | null`.

## Reuse
- Reuse `AdjacentEntityType` / `ADJACENT_ENTITY_TYPES` from
  `find-adjacent-entities` (already covers the 5 domains).
- Reuse `findBiomeByRef` from `rename-biome`.
- Reuse `parseEntityRef` from `_shared` for the non-biome parse path;
  bespoke local parser for biome (allows id 0 — matching
  `find_cells_adjacent_to_entity` / `find_cells_by_biome`).

## Validation
- `entity_type` missing / not string / not one of the 5 canonical values
  → `errorResult("entity_type must be one of ...")`.
- `entity` validated via `parseEntityRef` for non-biome; bespoke parser
  for biome that allows `0`.
- Un-resolvable ref → `errorResult("Could not resolve <type> <ref>.")`.
- `not-ready` → error mentioning `map:generated`.

## Testing
Follow `get-entity-cells.test.ts` + `find-cells-adjacent-to-entity.test.ts`:

- Pure collector tests:
  - BBox for a state by numeric id.
  - Resolve by case-insensitive name / fullName.
  - BBox for province / culture / religion.
  - Biome domain via `biomesData`.
  - Entity with zero assigned cells → empty bbox + `cells_count: 0`.
  - Entity with a single cell → width / height = 0, cx/cy = the point.
  - `pack.cells.p` entries that are `undefined` / wrong shape → skipped.
  - `"not-ready"` on missing pack / `pack.cells.i` / `pack.cells.p` /
    biomesData (biome domain).
  - `"unknown-entity"` for retired state, unknown name, index-0
    placeholder, retired biome slot, unknown biome name.

- Tool surface tests:
  - ok payload for id / name inputs.
  - Accepts mixed-case `entity_type`.
  - Rejects unknown `entity_type`, missing / invalid `entity`.
  - Accepts `entity: 0` for biome but rejects negatives / fractions.
  - Surfaces `"not-ready"` / `"unknown-entity"` as structured errors.
  - `getEntityBboxTool` exports the expected name and schema.

- `defaultGetEntityBboxRuntime` integration block:
  - Stubs `globalThis.pack` + `globalThis.biomesData` via
    `as unknown as { pack?: unknown; biomesData?: unknown }` in
    `beforeEach`; restores in `afterEach`.
  - Exercises multiple domains (state + biome) through the real default
    path.
  - Confirms `"not-ready"` surfaces when pack is missing.

## Wiring
- Register in `src/ai/index.ts` immediately after
  `getEntityCellsTool` (or contiguous with the other get-entity-*
  tools).
- Alphabetical import position: after `getCultureInfoTool` / before
  `getFeatureInfoTool` — but keep next to `get-entity-cells` for
  discoverability (the file already handles this).
- Barrel re-exports: `createGetEntityBboxTool`,
  `defaultGetEntityBboxRuntime`, `getEntityBboxTool`,
  `collectEntityBbox`, and the types.
- README_AI.md: add a row directly below `get_entity_cells`.

## Out of scope
- Vertex-based (exact polygon) extents — centroids are the standard
  cheap approximation used elsewhere in FMG.
- Oriented bounding boxes / convex hulls.
- Multi-entity union bboxes.

## Verify
- `npm run build` — clean.
- `npm test` — 244 files / 3816 → 245 files / 3816 + new-case count.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
