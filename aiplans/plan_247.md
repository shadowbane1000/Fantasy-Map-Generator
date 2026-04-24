# Plan 247 — `get_population_stats` AI tool

## Use case

Compute **aggregate population statistics for the whole world**: total population, urban vs. rural split, and top-N most populous states and burgs. A read-only summary useful before acting on demographic-weighted decisions (e.g. picking which state to expand, which cities to highlight, or which burgs dominate the map).

The tool should:

- Accept **no required params**. Optional `top_n` (integer, default 10) for how many top states and top burgs to return.
- Compute:
  - `population_total` — sum across the whole map of `rural + urban` contributions.
    - Rural: `pack.cells.pop[k] × populationRate` for every cell `k` (typed-array sum).
    - Urban: `burg.population × populationRate × urbanization` for every non-removed burg (skipping the index-0 placeholder).
  - `urban_population` — sum of burg pops × populationRate × urbanization.
  - `rural_population` — sum of cells.pop × populationRate.
  - `top_states` — top N states by computed population (id > 0, non-removed). Each entry: `{ i, name, population }`, sorted desc.
  - `top_burgs` — top N burgs by computed population (id > 0, non-removed). Each entry: `{ i, name, population }`, sorted desc.
- Return `{ ok, population_total, urban_population, rural_population, top_states, top_burgs, population_rate, urbanization }` — all integers rounded except the rates.

## Design

Mirror `get-map-info.ts` (read-only summary with runtime seam) + the population math pattern from `get-province-info.ts` / `get-state-info.ts`:

1. **Pure collector** `readPopulationStatsFromPack(pack, rates, topN)` — independent of globals. Returns a `PopulationStats` object or `"not-ready"` when `pack` / `pack.cells` / `pack.burgs` / `pack.states` are missing.
2. **Runtime seam** `PopulationStatsRuntime` with a single `readStats(topN)` method. `defaultPopulationStatsRuntime` reads `pack` via `getPack` and reads `populationRate` / `urbanization` via `getGlobal`.
3. **Tool factory** `createGetPopulationStatsTool(runtime?)` exporting default `getPopulationStatsTool`.
4. **Constants**: `DEFAULT_TOP_N = 10`, `MAX_TOP_N = 500`.

## Algorithm

1. Compute safe `rate = populationRate > 0 ? populationRate : 1` and `urban = urbanization > 0 ? urbanization : 1`.
2. Rural: walk `pack.cells.pop` (typed array — iterate by index), summing finite non-negative values.
3. Urban + per-burg top: walk `pack.burgs`, skipping index 0 / removed. For each, read `raw = b.population`, compute `scaled = raw * rate * urban`. Accumulate into `urbanRaw`. Push `{ i, name, population: Math.round(scaled) }` into a burg candidate list.
4. Per-state: walk `pack.states`, skipping id 0 / removed. Use `s.rural ?? 0` and `s.urban ?? 0` (pre-aggregated on each state — same as `list_states` / `get_state_info`), compute `population = Math.round((rural + urban) * rate)`. Push `{ i, name, population }` into a state candidate list. (Note: state per-entry `rate` matches `list_states`; the per-world totals come directly from cell+burg sums, which is authoritative.)
5. Sort burg and state candidate lists desc by population, slice to `topN`.
6. Build final integers: `rural = Math.round(ruralRaw * rate)`, `urban = Math.round(urbanRaw * rate * urban)`, `total = Math.round(ruralRaw * rate + urbanRaw * rate * urban)`.

## Validation rules

- `top_n` (optional): when present, must be an integer in `[0, MAX_TOP_N]`. Default `DEFAULT_TOP_N`. `0` means "return an empty list" (allowed).
- `not-ready` → error message matching the `get_map_info` style ("Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).").

## Tool registration

- Import in `src/ai/index.ts` alongside `getMapInfoTool`.
- Export the runtime seam and collector.
- Register in `buildDefaultRegistry` right after `getMapInfoTool` (keeps the pair together).

## README_AI.md row

Add a row near `get_map_info` (after it / before `get_state_info`). Describe the computation (cells.pop × populationRate for rural, burg.population × populationRate × urbanization for urban), top_n param, return shape, use cases (demographic audits, "show me the big cities"), and mention the API key requirement.

## Tests

Mirror `get-map-info.test.ts` + `get-state-info.test.ts`:

- Pure collector tests:
  - full population sums (rural + urban correct given rates)
  - skips index-0 / removed burgs; skips removed / id-0 states
  - top_n limits the returned lists; sorts descending
  - top_n=0 returns empty arrays
  - top_n larger than available returns the full list
  - `not-ready` when pack / cells / burgs / states missing
  - safe multiplier fallback when rates are 0 / NaN / missing
- Tool surface:
  - returns JSON body with all expected fields (`ok`, `population_total`, etc.)
  - default `top_n` is 10
  - rejects non-integer / negative / > MAX_TOP_N `top_n` with structured error
  - surfaces `not-ready` as a structured error
  - ignores unrelated input keys
  - exported as `getPopulationStatsTool` with schema `type: object`, no required, `top_n` property
- `defaultPopulationStatsRuntime` integration block: seed `globalThis.pack` + `populationRate` + `urbanization`, verify real read, and `not-ready` when pack is cleared.

## Files to create / edit

- Create `src/ai/tools/get-population-stats.ts`
- Create `src/ai/tools/get-population-stats.test.ts`
- Edit `src/ai/index.ts` (import, export, register)
- Edit `README_AI.md` (row after `get_map_info`)
