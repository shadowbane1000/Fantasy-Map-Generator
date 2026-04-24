# Plan 259: `get_religion_distribution` tool

Add a new AI tool that aggregates the distribution of religions across the
map — cell count, percentage of total religion-bearing cells, area, and
followers (scaled population). Parallel to a future `get_biome_distribution`
and a sibling of `get_population_stats`.

## Goals

- Tool name: `get_religion_distribution`.
- Accepts no parameters (empty object schema).
- Iterates `pack.religions`, skipping the index-0 placeholder
  ("No religion") and any `removed: true` entries.
- Uses pre-aggregated fields on each religion: `religion.cells`,
  `religion.area`, `religion.rural`, `religion.urban` — no per-cell scan.
- Computes followers as `Math.round((rural + urban) × populationRate)` with
  the same fallback (`rate <= 0 / NaN → 1`) that `list_religions` uses.
- Computes per-religion `percentage` as
  `cells_count / total_cells × 100` using the active (non-removed,
  non-placeholder) religions only.
- Returns `{ ok, total_cells, total_followers, religions }` sorted by
  `cells_count` descending.
- Read-only. Requires an Anthropic API key to surface through the chat
  harness.

## Architecture

- Pure aggregator `readReligionDistributionFromPack(pack, populationRate)`
  operating on a minimal `ReligionDistributionPackLike`. Returns
  `ReligionDistribution | "not-ready"`.
- Runtime seam `ReligionDistributionRuntime` with
  `defaultReligionDistributionRuntime` reading `window.pack` /
  `window.populationRate` via `getPack` / `getGlobal`.
- `createGetReligionDistributionTool(runtime)` factory producing a `Tool`
  with the standard `{name, description, input_schema, execute}` shape,
  plus a default-bound `getReligionDistributionTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, factory, pure
  function, runtime, default tool) near the `get_population_stats`
  re-exports.
- Tool registered in `buildDefaultRegistry()` adjacent to
  `getPopulationStatsTool`.
- README_AI.md row added adjacent to `get_population_stats`.

## Validation

- No inputs. Extra / unrelated keys on the input are ignored (consistent
  with `get_population_stats`).
- Rejects un-generated map (`pack` / `pack.religions` missing) with
  "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  total_cells: number,      // sum of religion.cells over active religions
  total_followers: number,  // sum of per-religion followers (scaled)
  religions: [{
    i: number;
    name: string;
    color: string | null;
    type: string | null;   // Folk / Organized / Cult / Heresy / …
    form: string | null;
    cells_count: number;   // religion.cells (pre-aggregated)
    percentage: number;    // 0..100, floating, cells_count / total_cells × 100; 0 when total_cells is 0
    area: number;          // religion.area
    followers: number;     // rounded (rural + urban) × populationRate
  }],
}
```

## Tests

A single `get-religion-distribution.test.ts` with three suites:
1. Pure aggregator: skips index-0 placeholder + removed, sums totals,
   orders by `cells_count` desc, computes percentage correctly, scales
   followers by `populationRate`, falls back to raw `rural + urban` when
   rate is 0 / NaN / negative, maps missing optional fields to `null`,
   treats missing numeric fields as 0, not-ready handling, empty-religions
   handling (total_cells = 0 → percentage = 0).
2. Tool surface: returns `ok: true` with well-formed payload, ignores
   unrelated input keys, surfaces `not-ready` as a structured error,
   schema export (no required fields).
3. Default runtime integration: backs against `globalThis.pack` +
   `globalThis.populationRate`, asserts happy and missing-pack paths.

## Files

- `src/ai/tools/get-religion-distribution.ts` — implementation.
- `src/ai/tools/get-religion-distribution.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `get_population_stats`.
