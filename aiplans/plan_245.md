# Plan 245 — `find_orphan_cells` AI tool

## Use case

Audit **orphan cells** — land cells that have no state assignment (`pack.cells.state === 0`, the Neutrals / Wildlands placeholder). Useful before creating new states / zones to see which wilderness is unclaimed, or to sanity-check post-generation state coverage.

The tool should:

- Accept **no required params**.
- Optional `include_water` (boolean, default `false`). When `true`, also include water cells (any cell with `state === 0`). Default is land-only (`h >= 20`).
- Optional `limit` (integer in `[1, 100000]`, default `10000`) — caps the returned `cells` array; `count` still reports the unlimited total.
- Iterate `pack.cells.state`, collect every index `k` where `state[k] === 0` AND (`include_water` OR `pack.cells.h[k] >= 20`).
- Read-only — no pack mutation, no redraws.
- Return `{ ok, cells, count, include_water }`.

## Design

Mirror `find-cells-by-height-range.ts` / `find-cells-by-biome.ts`:

1. **Pure collector** `findOrphanCellsInPack(pack, includeWater, limit)` — independent of globals. Returns `{ cells, count }` or `"not-ready"` when pack / cells / state / h are missing.
2. **Runtime seam** `FindOrphanCellsRuntime` with a single `find(includeWater, limit)` method. `defaultFindOrphanCellsRuntime` reads from `globalThis.pack` via `getPack`.
3. **Tool factory** `createFindOrphanCellsTool(runtime?)` exporting a default `findOrphanCellsTool` that uses the default runtime.
4. **Constants**: `DEFAULT_FIND_ORPHAN_CELLS_LIMIT = 10000`, `MAX_FIND_ORPHAN_CELLS_LIMIT = 100000`, `ELEVATION_NEUTRAL_HEIGHT = 20` (local, not re-exported from elsewhere).

## Validation rules

- `include_water` (optional): must be a boolean if present. Default `false`.
- `limit` (optional): integer in `[1, MAX_FIND_ORPHAN_CELLS_LIMIT]`. Default `DEFAULT_FIND_ORPHAN_CELLS_LIMIT`.
- `not-ready` → `"Map is not ready yet. Wait for the map to finish generating ..."`.

## Not-ready sentinels

`findOrphanCellsInPack` returns `"not-ready"` when:

- `pack` is undefined
- `pack.cells` is missing
- `pack.cells.state` is missing or lacks a numeric length
- For the land-only path (default `include_water=false`), `pack.cells.h` is missing or lacks a numeric length

## Tool registration

- Add import to `src/ai/index.ts` alongside `findCellsByHeightRangeTool` imports.
- Export the runtime seam and collector.
- Register in the "find cells" block after `findCoastCellsTool` and before `listStatesTool`.

## README_AI.md row

Add a row immediately after `find_cells_by_population_range` (before `regenerate_map`). Describe the signal (`pack.cells.state === 0` plus optional land filter), default = land only, include-water toggle, limit, return shape, use cases (wilderness audit, seeding new states), and mention the API key requirement.

## Tests

Mirror `find-cells-by-height-range.test.ts`:

- Pure collector:
  - default (land only): collects cells with `state===0 && h>=20`
  - `include_water=true`: collects all cells with `state===0`
  - none match: empty `cells`, `count=0`
  - truncates by limit but keeps full count
  - `not-ready` when pack / cells / state / h missing
- Tool surface:
  - ok path (default, include_water true)
  - applies default limit when omitted
  - applies default `include_water=false` when omitted
  - rejects non-boolean `include_water`
  - rejects invalid limit
  - surfaces `not-ready` as structured error
  - asserts exported tool name / schema (no required fields)
  - exposes DEFAULT / MAX constants
- Integration: `defaultFindOrphanCellsRuntime` against `globalThis.pack`.
