# Plan 264: `get_province_distribution` tool

Add a new AI tool that aggregates the distribution of provinces across
the current map — the province-level parallel of
`get_state_distribution` / `get_culture_distribution` /
`get_religion_distribution`. Unlike states / cultures / religions which
carry pre-aggregated `cells` / `rural` / `urban` fields, provinces do
NOT, so the tool must derive per-province cell count / area / rural pop
by walking `pack.cells.province`, and urban pop by walking `pack.burgs`
— mirroring the derivation already done by `find_largest_provinces` /
`get_province_info`.

## Goals

- Tool name: `get_province_distribution`.
- Accepts no parameters (empty object schema).
- Iterates `pack.provinces`, skipping the index-0 placeholder and any
  `removed: true` entries.
- Scans `pack.cells.province` once to aggregate per-province cell count,
  area, and rural pop. Scans `pack.burgs` once to add urban pop (using
  `burg.cell` → `pack.cells.province[burg.cell]`).
- `percentage` is each province's share of `total_cells` (sum of active
  provinces' derived `cells_count`) — `cells_count / total_cells × 100`,
  floating, `0` when `total_cells` is `0`.
- Population is **raw** `ruralRaw + urbanRaw` (same semantics as
  `find_largest_provinces` — NOT multiplied by
  `populationRate × urbanization`; this matches the `find_largest_*`
  convention, whereas `get_province_info.population_total` is the
  rate-scaled display value).
- Returns `{ ok, total_cells, total_population, provinces }` sorted by
  `cells_count` descending. Each province is
  `{ i, name, fullName, formName, color, cells_count, percentage, area,
  population }`; `fullName` / `formName` / `color` fall back to `null`.
- Read-only. Requires an Anthropic API key.

## Architecture

- Pure aggregator
  `readProvinceDistributionFromPack(pack)` operating on a minimal
  `ProvinceDistributionPackLike` (mirrors the shape used by
  `find-largest-provinces.ts`: `provinces[]`, `burgs[]`,
  `cells: { province, pop, area }`). Returns
  `ProvinceDistribution | "not-ready"`. Not-ready when `pack` or
  `pack.provinces` is missing.
- Single pass over `pack.cells.province` building a per-province-id
  `Aggregate` map (`cellsCount`, `area`, `ruralRaw`) — skip
  `pid <= 0` (province id 0 = placeholder / cells not owned by any
  active province).
- Single pass over `pack.burgs` to add `urbanRaw` — skip removed /
  index-0 burgs, skip burgs with out-of-range `cell`, map
  `cell → pid` via `pack.cells.province[cell]`, skip when `pid <= 0`.
  Matches `find-largest-provinces` exactly.
- Single pass over `pack.provinces` to build entries: skip
  `province.i === 0` and `province.removed`. Read aggregate (default to
  zeros when absent). Round `area` and `population` with
  `Math.max(0, Math.round(...))`.
- Compute `total_cells = Σ cells_count` and
  `total_population = Σ population` across active provinces. Then
  compute `percentage = (cells_count / total_cells) * 100` (0 when
  `total_cells === 0`) and sort by `cells_count` desc.
- Runtime seam `ProvinceDistributionRuntime` with
  `defaultProvinceDistributionRuntime` reading `window.pack` via
  `getPack<ProvinceDistributionPackLike>()`. No `populationRate` /
  `urbanization` needed — pop stays raw.
- `createGetProvinceDistributionTool(runtime)` factory producing a
  `Tool`, plus a default-bound `getProvinceDistributionTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, factory, pure
  function, runtime, default tool) adjacent to the
  `get-province-info` re-exports.
- Tool registered in `buildDefaultRegistry()` right after
  `getStateDistributionTool`.
- README_AI.md row added adjacent to `get_state_distribution`.

## Validation

- No inputs. Extra / unrelated keys on the input are ignored (consistent
  with `get_state_distribution` / `get_culture_distribution`).
- Rejects un-generated map (`pack` / `pack.provinces` missing) with
  "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  total_cells: number,
  total_population: number,
  provinces: Array<{
    i: number,
    name: string,
    fullName: string | null,
    formName: string | null,
    color: string | null,
    cells_count: number,
    percentage: number,
    area: number,
    population: number,
  }>,
}
```

## Tests

A single `get-province-distribution.test.ts` with three suites:

1. Pure aggregator: skips id-0 placeholder and removed provinces; sorts
   by `cells_count` descending; computes `total_cells` from derived
   per-province counts; computes `total_population` from raw
   rural + urban; percentage = cells/total × 100 and 0 when
   `total_cells === 0`; missing optional fields map to `null`; missing
   cells / burgs → zeros; ignores removed burgs; ignores burgs whose
   cell sits on province 0; `not-ready` on missing pack /
   pack.provinces.
2. Tool surface: returns `ok: true` happy path; schema export (no
   `required` array, empty `properties`); ignores unrelated input keys;
   surfaces `not-ready` as a structured error.
3. Default runtime integration: backs against `globalThis.pack`, asserts
   happy and missing-pack paths.

## Files

- `src/ai/tools/get-province-distribution.ts` — implementation.
- `src/ai/tools/get-province-distribution.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `get_state_distribution`.
