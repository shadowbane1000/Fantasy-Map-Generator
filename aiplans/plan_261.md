# Plan 261: `get_state_distribution` tool

Add a new AI tool that aggregates the distribution of states across the
map — cell count, percentage of all land (non-removed states' cells),
area, population (scaled rural + urban), and capital name. Parallel to
`get_religion_distribution` / `get_culture_distribution` and a sibling of
`get_population_stats`.

## Goals

- Tool name: `get_state_distribution`.
- Accepts no parameters (empty object schema).
- Iterates `pack.states`, skipping the index-0 placeholder ("Neutrals")
  and any `removed: true` entries.
- Uses pre-aggregated fields on each state: `state.cells`, `state.area`,
  `state.rural`, `state.urban` — no per-cell scan.
- Resolves the capital burg name via `pack.burgs[state.capital].name`
  (`null` when the state has no assigned capital or burg is missing).
- Computes population as `Math.round((rural + urban) × populationRate)`
  with the same fallback (`rate <= 0 / NaN → 1`) that `list_states` uses.
- Computes per-state `percentage` as
  `cells_count / total_cells × 100` using the active (non-removed,
  non-placeholder) states only.
- Returns
  `{ ok, total_cells, total_population, states }` sorted by
  `cells_count` descending.
- Read-only. Requires an Anthropic API key.

## Architecture

- Pure aggregator `readStateDistributionFromPack(pack, populationRate)`
  operating on a minimal `StateDistributionPackLike`. Returns
  `StateDistribution | "not-ready"`.
- Runtime seam `StateDistributionRuntime` with
  `defaultStateDistributionRuntime` reading `window.pack` /
  `window.populationRate` via `getPack` / `getGlobal`.
- `createGetStateDistributionTool(runtime)` factory producing a `Tool`
  with the standard `{name, description, input_schema, execute}` shape,
  plus a default-bound `getStateDistributionTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, factory, pure
  function, runtime, default tool) near the `get_religion_distribution`
  re-exports.
- Tool registered in `buildDefaultRegistry()` adjacent to
  `getReligionDistributionTool`.
- README_AI.md row added adjacent to `get_religion_distribution`.

## Validation

- No inputs. Extra / unrelated keys on the input are ignored (consistent
  with `get_religion_distribution`).
- Rejects un-generated map (`pack` / `pack.states` missing) with
  "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  total_cells: number,       // sum of state.cells over active states
  total_population: number,  // sum of per-state populations (scaled)
  states: [{
    i: number;
    name: string;
    fullName: string | null;
    form: string | null;
    color: string | null;
    capital: string | null;   // pack.burgs[state.capital].name or null
    cells_count: number;       // state.cells (pre-aggregated)
    percentage: number;        // 0..100, floating, cells_count / total_cells × 100; 0 when total_cells is 0
    area: number;              // state.area
    population: number;        // rounded (rural + urban) × populationRate
  }],
}
```

## Tests

A single `get-state-distribution.test.ts` with three suites:
1. Pure aggregator: skips index-0 placeholder + removed, sums totals,
   orders by `cells_count` desc, computes percentage correctly, scales
   population by `populationRate`, falls back to raw `rural + urban`
   when rate is 0 / NaN / negative, resolves capital names from burgs,
   maps missing optional fields to `null`, treats missing numeric fields
   as 0, not-ready handling, empty-states handling (total_cells = 0 →
   percentage = 0).
2. Tool surface: returns `ok: true` with well-formed payload, ignores
   unrelated input keys, surfaces `not-ready` as a structured error,
   schema export (no required fields).
3. Default runtime integration: backs against `globalThis.pack` +
   `globalThis.populationRate`, asserts happy and missing-pack paths.

## Files

- `src/ai/tools/get-state-distribution.ts` — implementation.
- `src/ai/tools/get-state-distribution.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `get_religion_distribution`.
