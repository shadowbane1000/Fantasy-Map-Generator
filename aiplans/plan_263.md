# Plan 263: `get_climate_stats` tool

Add a new AI tool that aggregates per-map climate statistics — min, max,
and mean of both temperature (°C) and precipitation — by scanning the
grid-level arrays `grid.cells.temp` and `grid.cells.prec`. A sibling of
`get_population_stats` (aggregate analog) and the read-side summary
companion to `find_cells_by_temperature_range` /
`find_cells_by_precipitation_range`.

## Goals

- Tool name: `get_climate_stats`.
- Accepts no parameters (empty object schema).
- Operates on `window.grid.cells.temp` and `window.grid.cells.prec`
  directly — these are the authoritative per-grid-cell sources the
  per-cell lookup in `get_cell_info` and the range finders use.
- For each of temperature / precipitation, scans the typed array once
  and computes `min`, `max`, `mean`. `mean` is a floating-point number
  (no rounding) to keep precision meaningful at small sample sizes.
- Reports `grid_cells` = the length of the iterated array (same value
  for both arrays — the grid is uniform) so the caller can sanity-check
  the sample size.
- Returns
  `{ ok, grid_cells, temperature: {min, max, mean}, precipitation: {min, max, mean} }`.
- Read-only. Requires an Anthropic API key.

## Architecture

- Pure aggregator `readClimateStatsFromGrid(grid)` operating on a
  minimal `ClimateStatsGridLike`. Returns `ClimateStats | "not-ready"`.
  Not-ready when `grid` / `grid.cells` / either of `temp` / `prec` is
  missing or lacks a numeric `length`.
- Iteration scans both arrays in parallel in a single pass over `length`
  (they are always the same length in the real app). Non-numeric /
  non-finite entries are skipped for that stat only (so a stray NaN in
  `temp` doesn't poison `prec`).
- When an array yields zero valid entries, its stats default to
  `{ min: 0, max: 0, mean: 0 }` — same shape, distinguishable from a
  real populated stat because `grid_cells` will still show the array
  length (or the caller can sanity-check via a range finder).
- Runtime seam `ClimateStatsRuntime` with `defaultClimateStatsRuntime`
  reading `window.grid` via `getGlobal<ClimateStatsGridLike>("grid")`.
- `createGetClimateStatsTool(runtime)` factory producing a `Tool` with
  the standard `{name, description, input_schema, execute}` shape, plus
  a default-bound `getClimateStatsTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, factory, pure
  function, runtime, default tool) adjacent to the
  `get-population-stats` re-exports.
- Tool registered in `buildDefaultRegistry()` right after
  `getPopulationStatsTool`.
- README_AI.md row added adjacent to `get_population_stats`.

## Validation

- No inputs. Extra / unrelated keys on the input are ignored (consistent
  with `get_population_stats`).
- Rejects un-generated map (`grid` / `grid.cells` / `grid.cells.temp` /
  `grid.cells.prec` missing) with "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  grid_cells: number,
  temperature: {
    min: number,
    max: number,
    mean: number,
  },
  precipitation: {
    min: number,
    max: number,
    mean: number,
  },
}
```

## Tests

A single `get-climate-stats.test.ts` with three suites:
1. Pure aggregator: computes correct min/max/mean for hand-crafted
   fixtures; handles single-element array; handles negative
   temperatures; skips non-finite / NaN entries but keeps other-array
   stats intact; empty array → zeros; not-ready on missing grid /
   grid.cells / grid.cells.temp / grid.cells.prec.
2. Tool surface: returns `ok: true` with well-formed payload; ignores
   unrelated input keys; surfaces `not-ready` as a structured error;
   schema export (no `required` array).
3. Default runtime integration: backs against `globalThis.grid`,
   asserts happy and missing-grid paths.

## Files

- `src/ai/tools/get-climate-stats.ts` — implementation.
- `src/ai/tools/get-climate-stats.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `get_population_stats`.
