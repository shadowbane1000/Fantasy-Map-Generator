# Plan 260: `get_culture_distribution` tool

Add a new AI tool that aggregates the distribution of cultures across the
map — cell count, percentage of total culture-bearing cells, area, and
population (scaled). Parallel to the just-merged
`get_religion_distribution` and `get_biome_distribution`, sibling of
`get_population_stats`.

## Goals

- Tool name: `get_culture_distribution`.
- Accepts no parameters (empty object schema).
- Iterates `pack.cultures`, skipping only `removed: true` entries.
  **Includes culture id 0 (Wildlands)** — unlike religions / states / burgs
  where id 0 is a placeholder, the Wildlands slot is a real culture that
  the Culture Editor / `get_culture_info` treat as readable.
- Uses pre-aggregated fields on each culture: `culture.cells`,
  `culture.area`, `culture.rural`, `culture.urban` — no per-cell scan.
- Computes population as `Math.round((rural + urban) × populationRate)`
  with the same safe fallback (`rate <= 0 / NaN → 1`) that
  `list_cultures` uses. Not multiplied by `urbanization` — the raw
  `rural + urban` total already combines both, matching
  `get_religion_distribution`.
- Computes per-culture `percentage` as
  `cells_count / total_cells × 100` using the active (non-removed)
  cultures only.
- Returns `{ ok, total_cells, total_population, cultures }` sorted by
  `cells_count` descending.
- Read-only. Requires an Anthropic API key to surface through the chat
  harness.

## Architecture

- Pure aggregator `readCultureDistributionFromPack(pack, populationRate)`
  operating on a minimal `CultureDistributionPackLike`. Returns
  `CultureDistribution | "not-ready"`.
- Runtime seam `CultureDistributionRuntime` with
  `defaultCultureDistributionRuntime` reading `window.pack` /
  `window.populationRate` via `getPack` / `getGlobal`.
- `createGetCultureDistributionTool(runtime)` factory producing a `Tool`
  with the standard `{name, description, input_schema, execute}` shape,
  plus a default-bound `getCultureDistributionTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, factory, pure
  function, runtime, default tool) near the `get_religion_distribution`
  re-exports.
- Tool registered in `buildDefaultRegistry()` adjacent to
  `getReligionDistributionTool`.
- README_AI.md row added adjacent to `get_religion_distribution`.

## Validation

- No inputs. Extra / unrelated keys on the input are ignored (consistent
  with `get_population_stats` / `get_religion_distribution`).
- Rejects un-generated map (`pack` / `pack.cultures` missing) with
  "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  total_cells: number,         // sum of culture.cells over non-removed cultures (includes Wildlands)
  total_population: number,    // sum of per-culture population (scaled)
  cultures: [{
    i: number;
    name: string;
    color: string | null;
    type: string | null;       // Generic / Naval / Nomadic / Hunting / Highland / Lake / River / …
    cells_count: number;       // culture.cells (pre-aggregated)
    percentage: number;        // 0..100, floating, cells_count / total_cells × 100; 0 when total_cells is 0
    area: number;              // culture.area
    population: number;        // rounded (rural + urban) × populationRate
  }],
}
```

## Tests

A single `get-culture-distribution.test.ts` with three suites:
1. Pure aggregator: includes culture 0 (Wildlands) but skips removed,
   sums totals, orders by `cells_count` desc, computes percentage
   correctly, scales population by `populationRate`, falls back to raw
   `rural + urban` when rate is 0 / NaN / negative, maps missing optional
   fields to `null`, treats missing numeric fields as 0, not-ready
   handling, empty-cultures handling (total_cells = 0 → percentage = 0
   for all).
2. Tool surface: returns `ok: true` with well-formed payload, ignores
   unrelated input keys, surfaces `not-ready` as a structured error,
   schema export (no `required` fields).
3. Default runtime integration: backs against `globalThis.pack` +
   `globalThis.populationRate`, asserts happy and missing-pack paths.

## Files

- `src/ai/tools/get-culture-distribution.ts` — implementation.
- `src/ai/tools/get-culture-distribution.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `get_religion_distribution`.
