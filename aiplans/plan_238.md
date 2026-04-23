# Plan 238 — `find_cells_by_feature` AI tool

## Goal
Add a new read-only AI tool `find_cells_by_feature` that lists every packed-grid cell index currently assigned to a given feature (continent / island / lake / ocean). This is the feature parallel of `find_cells_by_biome` — where biome filters `pack.cells.biome`, feature filters `pack.cells.f`.

## Input
- `feature` (required integer): the feature id. Must be `>= 1` (pack.features[0] is a sentinel placeholder the generator writes as `0`). The slot must hold a valid feature object (skip null/undefined/empty and the index-0 placeholder).
- `limit` (optional integer): maximum cells to return; default 10000, min 1, max 100000.

## Output
- Success: `{ ok: true, feature: { i, type, name }, cells: number[], count }` where `count` is the full unlimited total even when `cells` is truncated by `limit`. `type` is feature.type (island/lake/ocean) or null if unset; `name` is null when absent or empty.
- Errors:
  - Map not ready (missing pack / pack.features / pack.cells / pack.cells.f).
  - Invalid feature ref (non-integer, < 1, out of range, empty slot).
  - Out-of-range limit.

## Design
Follows the runtime-seam pattern used in `find-cells-by-biome.ts`:

1. `findFeatureCellsInPack(pack, featureId, limit)` — pure collector.
   - Validate pack + pack.features + pack.cells.f.
   - Validate featureId: `< 1` → not-found, `>= features.length` → not-found, entry falsy / not object → not-found.
   - Iterate `pack.cells.f`, accumulate matching indices up to `limit`, counting full total.
   - Return `{ i, type, name, cells, count }` or `"not-ready"` / `"not-found"` sentinel.
2. `FindCellsByFeatureRuntime` seam + `defaultFindCellsByFeatureRuntime` that delegates to `findFeatureCellsInPack(getPack(), featureId, limit)`.
3. `createFindCellsByFeatureTool(runtime)` — validates input and surfaces errors.
4. `findCellsByFeatureTool` default singleton.

Register in `src/ai/index.ts`:
- Import + named export surface.
- `registry.register(...)` next to `findCellsByBiomeTool`.

Add README_AI.md row right after `find_cells_by_biome`.

## Tests
Mirror `find-cells-by-biome.test.ts`:
- Pure collector happy paths (various feature ids, zero matches, limit truncation).
- Not-found for id 0, negative id, out-of-range id, empty slot.
- Not-ready for missing pack / features / cells.f.
- Tool surface: ok path, count-vs-limit, invalid feature input shapes, invalid limit, surfacing not-ready / not-found errors, default limit.
- `defaultFindCellsByFeatureRuntime` integration: set `globalThis.pack`, assert tool + runtime see it.

## Verification
- `npm run lint` matches baseline (7 warnings, 1 info, 0 errors).
- `npm run build` passes (tsc + vite).
- `npm test` all green.
