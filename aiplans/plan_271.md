# Plan 271 — `get_regiment_distribution` AI tool

## Goal

Add a new read-only AI tool `get_regiment_distribution` that reports, for the currently generated map, the distribution of military regiments grouped by `regiment.type`. This is the regiment-level parallel of `get_burg_distribution` / `get_marker_distribution` / `get_zone_distribution` — an aggregate companion to `list_regiments` / `find_regiments_by_type` / `find_regiments_by_state`.

## Use case

Answer questions like:

- "How are regiments distributed by type on this map?"
- "How many cavalry vs fleet regiments are there?"
- "What share of all soldiers are in melee regiments?"
- "Give me a breakdown of the military by unit type."

## Contract

- Accepts no required parameters (empty object).
- Iterates every state in `pack.states` via `isActive(state)` — skips the index-0 Neutrals placeholder and `removed: true` states.
- For each active state, iterates `state.military` (if present and an array), skipping falsy entries and regiments without a numeric `i`.
- Groups by `regiment.type`:
  - Non-empty string `type` values preserve their ORIGINAL casing (verbatim — e.g. `"melee"`, `"Melee"`, `"fleet"` are distinct buckets).
  - Regiments whose `type` is missing / non-string / empty / whitespace-only land in the sentinel `"untyped"` bucket.
- Per group accumulates:
  - `count` — number of regiments in the bucket.
  - `soldiers` — sum of `regiment.t` over the regiments in the bucket (0 for missing / non-finite `t`).
  - `percentage` — `count / total_regiments * 100`, floating, `0` when `total_regiments` is `0`.
- Returns `{ ok: true, total_regiments, total_soldiers, by_type: [{type, count, soldiers, percentage}] }`, sorted by `count` descending with ties broken by `type` ascending (lexicographic).
- When no active regiments exist, returns `{ ok, total_regiments: 0, total_soldiers: 0, by_type: [] }` — still `ok: true`.
- Errors only when the map is not ready (`pack` / `pack.states` missing).

## Design

Mirrors the existing runtime-seam pattern from `get-burg-distribution.ts` and `get-zone-distribution.ts`:

1. Pure aggregator `readRegimentDistributionFromPack(pack)` — deterministic function from a pack-like shape to a `RegimentDistribution | "not-ready"` value.
2. `RegimentDistributionRuntime` seam + `defaultRegimentDistributionRuntime` reading the live `window.pack` via `getPack<RegimentDistributionPackLike>()`.
3. `createGetRegimentDistributionTool(runtime)` factory producing the `Tool` and the default module-level `getRegimentDistributionTool` constant.

Reuses `RawState` / `RawRegiment` and the `isActive` helper from `_shared`. No new shared constants are introduced (no duplicate exports).

## Files

- New `src/ai/tools/get-regiment-distribution.ts` — runtime, aggregator, tool factory, default instance.
- New `src/ai/tools/get-regiment-distribution.test.ts` — pure-aggregator suite, tool-surface suite, and a `defaultRegimentDistributionRuntime (integration)` block that stubs `globalThis.pack` (with `as unknown as { pack?: unknown }` cast) to exercise the default seam.
- Edit `src/ai/index.ts`:
  - Import `getRegimentDistributionTool` alongside other distribution tools.
  - Re-export all new public members (type-only + values).
  - `registry.register(getRegimentDistributionTool)` near `getBurgDistributionTool` / other `*DistributionTool` registrations.
- Edit `README_AI.md`: add one tool row near `get_burg_distribution`, including the "Requires an Anthropic API key" pointer to match the rest of the tools.

## Tests

Pure aggregator:

- skips the index-0 Neutrals state
- skips `removed: true` states
- skips states with no `military` array or empty military
- skips falsy regiment entries and regiments missing numeric `i`
- groups by exact `regiment.type` string (preserves casing — no canonicalization)
- buckets missing / non-string / empty / whitespace-only types under `"untyped"`
- aggregates `soldiers` as the sum of `regiment.t` (0 when absent / non-finite)
- computes `percentage` correctly and sums ≈ 100
- sorts `by_type` by count desc, tie-break by type asc
- returns empty response for states-only-placeholder pack
- returns `"not-ready"` when `pack` is undefined or `pack.states` missing

Tool surface:

- returns ok payload with correct totals
- tolerates extra / null / undefined input
- surfaces `"not-ready"` as structured error
- exported schema: empty object, no required fields

Integration:

- stubs `globalThis.pack` and exercises `defaultRegimentDistributionRuntime.readDistribution()`
- `getRegimentDistributionTool.execute({})` resolves through the default runtime
- errors when pack is missing / `pack.states` missing

## Verification

- `npm run lint` matches the pre-change baseline (7 warnings / 1 info / 0 errors).
- `npm run build` succeeds (tsc + vite build).
- `npm test` passes — all existing tests plus the new file.
