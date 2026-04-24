# Plan 266: `get_burg_distribution` tool

Add a new AI tool that aggregates per-burg-type statistics over
`pack.burgs` — count and total scaled population — grouped by
`burg.type` (Generic / River / Lake / Naval / Nomadic / Hunting /
Highland). A sibling of `get_biome_distribution` /
`get_feature_distribution` / `get_culture_distribution` /
`get_state_distribution` and the aggregate companion to `list_burgs` /
`find_burgs_by_type` / `find_largest_burgs` / `get_burg_info`.

## Goals

- Tool name: `get_burg_distribution`.
- Accepts no parameters (empty object schema).
- Iterates `pack.burgs` linearly, skipping the index-0 placeholder and
  any `removed: true` entries — same walk `find_burgs_by_type` /
  `list_burgs` use.
- Groups by burg type. The type is resolved through `resolveBurgType`
  (case-insensitive match against the canonical `BURG_TYPES` set) so
  `"generic"` and `"Generic"` land in the same bucket as their canonical
  label. Burgs whose `type` is missing, non-string, empty, or not a
  canonical type land in the `"Generic"` bucket — the engine's de-facto
  default type (matches the fallback behaviour of `getType` in the legacy
  `burgs-generator` where a burg without an explicit type is treated as
  `Generic`). Using a canonical bucket keeps the output focused on the
  7 real burg types the AI and UI know about rather than surfacing
  legacy or malformed type strings.
- Aggregates per group: `{ type, count, population, percentage }` where
  `population` is the sum of `burg.population × populationRate × urbanization`
  across the group's burgs (matching `list_burgs` / `find_burgs_by_type`
  scaling), rounded. `percentage` is `count / total_burgs * 100`
  (floating — consistent with `get_feature_distribution` /
  `get_state_distribution` / `get_culture_distribution`). `0` when
  `total_burgs` is `0`.
- Returns `{ ok, total_burgs, total_population, by_type }` sorted by
  `count` descending with ties broken by `type` ascending
  (case-sensitive, canonical labels).
- Read-only. Requires an Anthropic API key.

## Architecture

- Pure aggregator `readBurgDistributionFromPack(pack, rates)` operating
  on a minimal `BurgDistributionPackLike` (a `burgs?` array of
  `RawBurg`). Returns `BurgDistribution | "not-ready"`. Not-ready when
  `pack` or `pack.burgs` is missing.
- Single pass over `pack.burgs`: skip `b.i === 0` and `b.removed`,
  resolve type via `resolveBurgType` with a `"Generic"` fallback, coerce
  `b.population` to a finite non-negative number (fallback 0),
  accumulate per-bucket `count` and raw `population` sum.
- Apply `populationRate × urbanization` scaling to each bucket's raw
  population sum once at the end (with the `safeMultiplier` `rate <= 0 /
  NaN → 1` fallback `list_burgs` uses), then round to integer.
- Sort `by_type` entries by `count` descending, tie-break ascending by
  canonical type label for deterministic ordering.
- Runtime seam `BurgDistributionRuntime` with
  `defaultBurgDistributionRuntime` reading
  `getPack<BurgDistributionPackLike>()`,
  `getGlobal<number>("populationRate")`, and
  `getGlobal<number>("urbanization")`.
- `createGetBurgDistributionTool(runtime)` factory producing a `Tool`
  with `name: "get_burg_distribution"` and an empty-properties input
  schema. Happy path emits `okResult`; `not-ready` emits the standard
  structured error pointing at `map:generated`.

## Tests

- `readBurgDistributionFromPack` suite:
  - skips index-0 placeholder and `removed: true` burgs,
  - groups burgs case-insensitively (`"generic"` bucket merges into
    `"Generic"`),
  - rolls non-canonical / missing / non-string / empty-string types
    into the `"Generic"` bucket,
  - sums scaled population (`raw × rate × urban`, rounded),
  - computes percentages (floats, sum to ~100),
  - sorts by count desc with ascending-type tie-break,
  - not-ready handling for missing pack / pack.burgs,
  - zero-burg pack yields `total_burgs: 0`, `total_population: 0`,
    `by_type: []`.
- Tool-surface suite:
  - `ok: true` happy path,
  - ignores unrelated input keys,
  - `not-ready` propagation,
  - schema export (empty properties, no `required` array).
- `defaultBurgDistributionRuntime` integration block toggling
  `globalThis.pack`, `globalThis.populationRate`,
  `globalThis.urbanization`.

## Registration

- Import slot (alphabetical): `get-burg-distribution` sits adjacent to
  `get-burg-info`.
- Re-export block near the other `get-*-distribution` re-exports.
- `registry.register(getBurgDistributionTool)` adjacent to the other
  distribution registrations.

## README_AI.md

Add a row near the existing `get_feature_distribution` entry describing
the tool surface, Anthropic API key requirement, and sample prompts.
