# Tasks 231 — find_cells_adjacent_to_entity

## Implementation
- [ ] Create `src/ai/tools/find-cells-adjacent-to-entity.ts`:
  - `ADJACENT_ENTITY_TYPES = ["state","province","culture","religion","biome"]`.
  - `DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT = 10000`.
  - `MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT = 100000`.
  - Types: `PackLike`, `BiomesDataLike`, `EntityCellsHit`,
    `CollectAdjacentCellsResult`.
  - Pure collector `collectAdjacentCellsForEntity(pack, biomesData, type, ref, limit)`
    iterating `pack.cells` and using `pack.cells.c[k]` to enumerate
    neighbors. For `biome` dispatch through `findBiomeByRef`; for the
    other 4 domains dispatch through `findEntityByRef`.
  - Runtime seam + `defaultFindCellsAdjacentToEntityRuntime`.
  - `parseEntityType`, `parseLimit` helpers.
  - `parseRefForType` that allows `0` only when type === "biome"
    (via its own parser) and delegates to `parseEntityRef` otherwise.
  - `createFindCellsAdjacentToEntityTool(runtime?)` returning the
    `Tool` with `name: "find_cells_adjacent_to_entity"`, the usual
    description, and an input schema with `entity_type` / `entity` /
    optional `limit`.
  - Export `findCellsAdjacentToEntityTool = createFindCellsAdjacentToEntityTool()`.

## Tests
- [ ] Create `src/ai/tools/find-cells-adjacent-to-entity.test.ts` with:
  - Pure collector block:
    - Border ring for a state / province / culture / religion on the
      hand-crafted 8-cell graph (uses `pack.cells.c` adjacency).
    - Border ring for a biome domain (with `biomesData`).
    - Dedupes neighbors.
    - Truncates `cells` at `limit`, preserves `count`.
    - Returns empty for an entity with no cells.
    - `not-ready` when pack / `pack.cells.i` / `pack.cells.c` missing.
    - `not-ready` when biome requested without biomesData.
    - `unknown-entity` for retired state, unknown name, index-0
      placeholder.
    - `unknown-entity` for retired biome slot + unknown biome name.
  - Tool surface block:
    - ok payload for id / name.
    - Mixed-case `entity_type`.
    - Respects limit and reports count.
    - Rejects invalid `entity_type`, `entity`, `limit`.
    - Surfaces `not-ready` / `unknown-entity` as structured errors.
    - Applies default limit when omitted.
    - `findCellsAdjacentToEntityTool` exports the expected name and
      schema.
  - `defaultFindCellsAdjacentToEntityRuntime` integration block
    (`globalThis as unknown as { pack?: unknown; biomesData?: unknown }`
    stubs in `beforeEach`; restores in `afterEach`).

## Registration
- [ ] In `src/ai/index.ts`:
  - Add the import immediately after
    `findCellsByBiomeTool` / near `getEntityCellsTool` (alpha order:
    after `find-cell-at-coords`, before `find-cells-by-biome`).
  - Add barrel re-exports (create/default runtime + constants +
    types).
  - Register it immediately after `getEntityCellsTool`.

## Docs
- [ ] Add a README_AI.md pipe-table row directly below
  `get_entity_cells` noting:
  - It returns the "border ring" (neighbors just outside the entity).
  - Domains: state / province / culture / religion / biome.
  - API-key note.
  - A couple of example prompts.

## Verify
- [ ] Lint baseline BEFORE: 7 warnings / 1 info / 0 errors (run
  `npm run lint 2>&1 | tail -5` to capture).
- [ ] `npm run build` succeeds.
- [ ] `npm test` — all tests pass; 242 files → 243 files;
  3737 → 3737 + new-case count.
- [ ] `npm run lint` still 7 warnings / 1 info / 0 errors.

## Commit
- [ ] `feat(ai): add find_cells_adjacent_to_entity tool` + short body.
- [ ] Stage only the four changed files:
  - `src/ai/tools/find-cells-adjacent-to-entity.ts`
  - `src/ai/tools/find-cells-adjacent-to-entity.test.ts`
  - `src/ai/index.ts`
  - `README_AI.md`
  - `aiplans/plan_231.md`
  - `aiplans/tasks_231.md`
