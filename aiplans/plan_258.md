# Plan 258: `get_biome_distribution` tool

Add a new read-only AI tool that returns aggregate per-biome statistics for
the entire map in a single call. A bridge between `list_biomes` (which only
reports counts when the Biomes Editor has been opened) and `get_biome_info`
(which aggregates but only for one biome at a time). Also the biome analog
of `get_population_stats` — a world-wide tallying call.

## Goals

- Tool name: `get_biome_distribution`.
- Accept no required params.
- Optional `include_removed` (boolean, default `false`): when `true`, also
  include biomes whose `biomesData.name[k]` slot is the sentinel `"removed"`
  (otherwise they are skipped, matching `findBiomeByRef` /
  `get_biome_info` behaviour).
- Iterate `biomesData.i` once; for each biome walk `pack.cells.biome` to
  count cells, sum `pack.cells.area`, and tally non-removed burgs whose
  cell's biome matches. The naive O(biomes × cells) pass is fine because
  the biome count is always tiny (≤ 255 per the `Uint8Array` cap).
- Compute `percentage = cells_count / total_cells * 100` (0 when
  `total_cells === 0`), rounded to 2 decimals.
- Return `{ ok, total_cells, biomes: [...] }` where each entry is
  `{ i, name, color, cells_count, percentage, area, burgs_count }` and
  the `biomes` array is sorted by `cells_count` desc (stable ties by `i`).
- Read-only. Requires an Anthropic API key to surface through the chat
  harness.

## Architecture

- Pure aggregator `readBiomeDistributionFromPack(biomesData, pack,
  includeRemoved)` operating on minimal `BiomesDataLike` and
  `BiomeDistributionPackLike` (narrow duck types — no dependency on the
  full `PackedGraph`). Returns `BiomeDistributionPayload | "not-ready"`.
- Runtime seam `BiomeDistributionRuntime` with
  `defaultBiomeDistributionRuntime` reading `biomesData` via
  `getGlobal<BiomesDataLike>("biomesData")` and `pack` via
  `getPack<BiomeDistributionPackLike>()`.
- `createGetBiomeDistributionTool(runtime)` factory producing the standard
  `{ name, description, input_schema, execute }` `Tool`, plus a
  default-bound `getBiomeDistributionTool` export.
- Single linear pass: build a `Map<biomeId, { cellsCount, area }>`
  keyed by integer biome id by walking `pack.cells.biome` once; then
  walk `pack.burgs` once to tally burgs per biome. The biome list
  iteration is then cheap — just a Map lookup per biome. This keeps the
  cost at O(cells + burgs + biomes) which is what we want.
- Re-exports added to `src/ai/index.ts` barrel (types, factory, pure
  function, runtime, default tool) adjacent to the `get_biome_info`
  re-exports.
- Tool registered in `buildDefaultRegistry` near `getBiomeInfoTool`.
- README_AI.md row added after the `get_biome_info` row.

## Validation

- `include_removed` (when provided) must be a boolean — anything else
  (number / null / string) is rejected with a descriptive error.
- Rejects un-generated map (`biomesData` / `biomesData.i` missing or
  `pack.cells` missing) with the usual "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  total_cells: number,
  biomes: [{
    i: number;
    name: string;
    color: string | null;
    cells_count: number;
    percentage: number;  // 0–100, rounded to 2 decimals
    area: number;
    burgs_count: number;
  }],
}
```

## Tests

A single `get-biome-distribution.test.ts` with three suites:

1. Pure aggregator: happy path with a small biomesData / pack (Marine +
   Hot desert + Grassland + removed), cell counts, percentages sum to
   ~100, area sums, burg tallies. `include_removed=false` hides the
   `"removed"` slot; `include_removed=true` includes it with 0 counts.
   Zero-cell pack returns `total_cells=0` with all percentages at 0.
   `not-ready` on missing `biomesData` / `pack.cells`. Biomes are sorted
   by `cells_count` desc.
2. Tool surface: default call (no args), `include_removed: true`,
   rejects non-boolean `include_removed`, surfaces `not-ready` as a
   structured error, schema export asserts `name` /
   `input_schema.type === "object"` / no required fields.
3. Default runtime integration: swaps `globalThis.biomesData` and
   `globalThis.pack`, asserts happy / missing-pack paths. Use
   `as unknown as { ... }` casts.

## Files

- `src/ai/tools/get-biome-distribution.ts` — implementation.
- `src/ai/tools/get-biome-distribution.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row adjacent to `get_biome_info`.
