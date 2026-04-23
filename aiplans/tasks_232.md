# Tasks 232 — get_entity_bbox

## Implementation
- [ ] Create `src/ai/tools/get-entity-bbox.ts`:
  - Reuse `AdjacentEntityType` / `ADJACENT_ENTITY_TYPES` from
    `./find-adjacent-entities` (do NOT re-declare them).
  - Types: `PackLike` (needs `cells.i`, `cells.p`, and the 5 domain
    fields), `BiomesDataLike`, `Bbox`, `EntityBboxHit`,
    `CollectEntityBboxResult`.
  - Pure collector `collectEntityBbox(pack, biomesData, type, ref)`
    iterating `pack.cells.i` once and reading coords from
    `pack.cells.p[k]` for every cell where `field[k] === target`.
    - Skip entries whose `p[k]` is missing / wrong shape.
    - Accumulate `x_min` / `y_min` / `x_max` / `y_max` and
      `cells_count`.
    - Empty result → every numeric bbox field is `null`.
  - Runtime seam: `GetEntityBboxRuntime.collect(type, ref)` →
    `CollectEntityBboxResult`. Default runtime delegates to
    `collectEntityBbox` with `getPack<PackLike>()` +
    `getGlobal<BiomesDataLike>("biomesData")`.
  - `parseEntityType`, `parseRefForType` (delegates to `parseEntityRef`
    for non-biome, bespoke parser for biome that allows id 0).
  - `createGetEntityBboxTool(runtime?)` returning the `Tool` with
    `name: "get_entity_bbox"`, description, and an input schema of
    `{entity_type, entity}` required.
  - Export `getEntityBboxTool = createGetEntityBboxTool()`.

## Tests
- [ ] Create `src/ai/tools/get-entity-bbox.test.ts` with:
  - Pure collector block:
    - BBox for a state by numeric id — verifies min/max and
      width/height/cx/cy.
    - Resolves source by case-insensitive name + fullName.
    - BBox for province / culture / religion.
    - BBox for biome domain via `biomesData`.
    - Empty bbox (nulls) when no cell matches.
    - Single-cell entity → width/height = 0; cx/cy = the point.
    - Skips `p[k]` entries that are undefined / wrong shape.
    - `"not-ready"` when pack / `pack.cells.i` / `pack.cells.p`
      missing, or biomesData missing for biome domain.
    - `"unknown-entity"` for retired state, unknown name, index-0
      placeholder, retired biome slot, unknown biome name.
  - Tool surface block:
    - ok payload for id / name.
    - Mixed-case `entity_type`.
    - Rejects invalid `entity_type`, `entity` (non-biome rules).
    - Accepts `entity: 0` for biome; rejects negatives / fractions.
    - Surfaces `"not-ready"` / `"unknown-entity"` as structured errors.
    - `getEntityBboxTool` exports the expected name and schema.
  - `defaultGetEntityBboxRuntime` integration block
    (`globalThis as unknown as { pack?: unknown; biomesData?: unknown }`
    stubs in `beforeEach`; restores in `afterEach`). Covers state +
    biome domains via the real default path.

## Registration
- [ ] In `src/ai/index.ts`:
  - Add import next to `getEntityCellsTool` (alpha order places
    `get-entity-bbox` BEFORE `get-entity-cells`).
  - Add barrel re-exports (`createGetEntityBboxTool`,
    `defaultGetEntityBboxRuntime`, `getEntityBboxTool`,
    `collectEntityBbox`, and the types).
  - Register it immediately after `getEntityCellsTool`.

## Docs
- [ ] Add a README_AI.md pipe-table row directly below
  `get_entity_cells` noting:
  - Returns the axis-aligned bounding box of an entity's cell
    centroids.
  - Domains: state / province / culture / religion / biome.
  - API-key note.
  - A couple of example prompts ("camera focus" / "zoom to").

## Verify
- [ ] Lint baseline BEFORE: 7 warnings / 1 info / 0 errors (run
  `npm run lint 2>&1 | tail -5` to capture).
- [ ] `npm run build` succeeds.
- [ ] `npm test` — all tests pass; 244 files → 245 files;
  3816 → 3816 + new-case count.
- [ ] `npm run lint` still 7 warnings / 1 info / 0 errors.

## Commit
- [ ] `feat(ai): add get_entity_bbox tool` + short body.
- [ ] Stage only the changed files:
  - `src/ai/tools/get-entity-bbox.ts`
  - `src/ai/tools/get-entity-bbox.test.ts`
  - `src/ai/index.ts`
  - `README_AI.md`
  - `aiplans/plan_232.md`
  - `aiplans/tasks_232.md`
