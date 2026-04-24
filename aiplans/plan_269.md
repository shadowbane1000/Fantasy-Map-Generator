# Plan 269 — `get_zone_distribution` AI tool

## Goal

Add a new read-only AI tool `get_zone_distribution` that reports, for the currently generated map, the distribution of zones grouped by `zone.type`. This is the zones-side parallel of `get_burg_distribution` / `get_marker_distribution` / `get_state_distribution` — an aggregate companion to `list_zones` / `find_zones_by_type`.

## Use case

Answer questions like:

- "How are zones distributed by type on this map?"
- "How many Invasions vs Disease zones are there?"
- "Give me a breakdown of the overlay zones."

## Contract

- Accepts no required parameters (empty object).
- Iterates `pack.zones`, skipping `removed: true` entries and null / undefined array slots.
- Groups by `zone.type`. Missing, non-string, or empty types are bucketed under the sentinel label `"untyped"`. Otherwise the original (trimmed, case-preserved) string is used as the bucket label.
- Per group accumulates:
  - `count` — number of zones in the bucket.
  - `cells` — sum of `zone.cells.length` over the zones in the bucket (0 if `cells` is missing or non-array).
  - `percentage` — `count / total_zones * 100`, floating, `0` when `total_zones` is `0`.
- Returns `{ ok: true, total_zones, total_cells, by_type: [{type, count, cells, percentage}] }`, sorted by `count` descending with ties broken by `type` ascending (lexicographic).
- When no active zones exist, returns `{ ok, total_zones: 0, total_cells: 0, by_type: [] }` — still `ok: true`.
- Errors only when the map is not ready (`pack` / `pack.zones` missing).

## Design

Mirrors the existing runtime-seam pattern from `get-burg-distribution.ts`:

1. Pure aggregator `readZoneDistributionFromPack(pack)` — deterministic function from a pack-like shape to a `ZoneDistribution | "not-ready"` value.
2. `ZoneDistributionRuntime` seam + `defaultZoneDistributionRuntime` reading the live `window.pack` via `getPack<ZoneDistributionPackLike>()`.
3. `createGetZoneDistributionTool(runtime)` factory producing the `Tool` and the default module-level `getZoneDistributionTool` constant.

Reuses `RawZone` from `_shared/pack-types.ts`. No new shared constants are introduced (no duplicate exports).

## Files

- New `src/ai/tools/get-zone-distribution.ts` — runtime, aggregator, tool factory, default instance.
- New `src/ai/tools/get-zone-distribution.test.ts` — pure-aggregator suite, tool-surface suite, and a `defaultZoneDistributionRuntime (integration)` block that stubs `globalThis.pack` (with `as unknown as { pack?: unknown }` cast) to exercise the default seam.
- Edit `src/ai/index.ts`:
  - Import `getZoneDistributionTool` alongside other distribution tools.
  - Re-export all new public members (type-only + values).
  - `registry.register(getZoneDistributionTool)` near the other zone tools (after `findZonesByTypeTool`) and near other `*DistributionTool` registrations.
- Edit `README_AI.md`: add one tool row near `get_burg_distribution` / `list_zones` / `find_zones_by_type`, including the "Requires an Anthropic API key" pointer to match the rest of the tools.

## Tests

Pure aggregator:

- skips removed zones
- skips null / undefined array slots
- includes zone with `i === 0` (zone ids are non-contiguous)
- groups by exact `zone.type` string (preserves casing — no canonicalization)
- buckets missing / non-string / empty / whitespace-only types under `"untyped"`
- aggregates `cells` as the sum of `zone.cells.length` (0 when absent / non-array)
- computes `percentage` correctly and sums ≈ 100
- sorts `by_type` by count desc, tie-break by type asc
- returns empty response for zones-empty pack
- returns `"not-ready"` when `pack` is undefined or `pack.zones` missing

Tool surface:

- returns ok payload with correct totals
- tolerates extra / null / undefined input
- surfaces `"not-ready"` as structured error
- exported schema: empty object, no required fields

Integration:

- stubs `globalThis.pack` and exercises `defaultZoneDistributionRuntime.readDistribution()`
- `getZoneDistributionTool.execute({})` resolves through the default runtime
- errors when pack is missing / `pack.zones` missing

## Verification

- `npm run lint` matches the pre-change baseline (7 warnings / 1 info / 0 errors).
- `npm run build` succeeds (tsc + vite build).
- `npm test` passes — all existing tests plus the new file.
