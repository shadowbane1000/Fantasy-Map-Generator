# Plan 265: `get_feature_distribution` tool

Add a new AI tool that aggregates per-feature-type statistics over
`pack.features` — count, total cells, total area — grouped by feature
`type` (continent / island / lake / ocean). A sibling of
`get_biome_distribution` / `get_culture_distribution` /
`get_state_distribution` and the aggregate companion to `list_features` /
`find_largest_features` / `get_feature_info`.

## Goals

- Tool name: `get_feature_distribution`.
- Accepts no parameters (empty object schema).
- Iterates `pack.features` linearly, skipping the index-0 placeholder the
  generator writes as `0` and any falsy / non-object slot — same walk
  `list_features` and `find_largest_features` use.
- Groups by an effective type. An entry is classified as `continent`
  when its `group === "continent"` (matches the `continent` convenience
  alias in `list_features`); otherwise the classification falls back to
  `feature.type` (`island`, `lake`, `ocean`). When neither is populated,
  the effective type is `"unknown"`.
- Aggregates per group: `{ count, cells, area, percentage }` where
  `cells` sums `feature.cells` and `area` sums `feature.area` across the
  group's features. `percentage` is `count / features_total * 100`
  (floating — consistent with `get_state_distribution` /
  `get_culture_distribution`). `0` when `features_total` is `0`.
- Also reports `land_features` (count where `feature.land === true`) and
  `water_features` (count where `feature.land !== true`).
- Returns
  `{ ok, features_total, land_features, water_features, by_type }`
  sorted by `count` descending with ties broken by `type` ascending.
- Read-only. Requires an Anthropic API key.

## Architecture

- Pure aggregator `readFeatureDistributionFromPack(pack)` operating on a
  minimal `FeatureDistributionPackLike`. Returns
  `FeatureDistribution | "not-ready"`. Not-ready when `pack` or
  `pack.features` is missing.
- Single pass over `pack.features[1..]`: skip falsy / non-object slots,
  determine effective type (`group === "continent"` → `"continent"`;
  else `feature.type` string when present; else `"unknown"`), coerce
  `cells` and `area` to finite numbers (fallback 0), accumulate group
  bucket, and tally `land_features` / `water_features`.
- Sort `by_type` entries by `count` descending, tie-break ascending by
  `type` for deterministic ordering.
- Runtime seam `FeatureDistributionRuntime` with
  `defaultFeatureDistributionRuntime` reading
  `getPack<FeatureDistributionPackLike>()`.
- `createGetFeatureDistributionTool(runtime)` factory producing a `Tool`
  with the standard `{name, description, input_schema, execute}` shape,
  plus a default-bound `getFeatureDistributionTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, factory, pure
  function, runtime, default tool) near the other get_*_distribution
  re-exports.
- Tool registered in `buildDefaultRegistry()` right after
  `getBiomeDistributionTool`.
- README_AI.md row added adjacent to `get_biome_distribution`.

## Validation

- No inputs. Extra / unrelated keys on the input are ignored (consistent
  with `get_biome_distribution` / `get_state_distribution`).
- Rejects un-generated map (`pack` / `pack.features` missing) with
  "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  features_total: number,     // active features (excludes placeholder)
  land_features: number,      // features with land === true
  water_features: number,     // features with land !== true
  by_type: Array<{
    type: string,             // "continent" | "island" | "lake" | "ocean" | "unknown"
    count: number,
    cells: number,
    area: number,
    percentage: number,
  }>,
}
```

## Tests

A single `get-feature-distribution.test.ts` with three suites:
1. Pure aggregator: skips index-0 placeholder and falsy slots; groups by
   `type`; treats `group === "continent"` as its own `"continent"`
   group; sums `cells` and `area`; computes percentages; sorts by count
   desc with ascending-type tie-break; counts land vs water; handles an
   all-placeholders pack; not-ready when pack / pack.features is missing;
   unknown-type classification when both type and group are absent.
2. Tool surface: returns `ok: true` with well-formed payload; ignores
   unrelated input keys; surfaces `not-ready` as a structured error;
   schema export (empty properties, no `required`).
3. Default runtime integration: backs against `globalThis.pack`, asserts
   happy and missing-pack paths.

## Files

- `src/ai/tools/get-feature-distribution.ts` — implementation.
- `src/ai/tools/get-feature-distribution.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `get_biome_distribution`.
