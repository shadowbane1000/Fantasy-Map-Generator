# Plan 267 — `get_river_distribution`

## Summary

New read-only AI tool that aggregates `pack.rivers` by `river.type`
(River / Stream / Creek / Branch / Fork / etc.) and returns per-group
counts, summed length, and percentage of the active river population.
Parallel in shape and conventions to `get_feature_distribution`.

## Payload shape

```ts
{
  ok: true,
  total_rivers: number,        // count of non-removed rivers (excludes index-0 placeholder and removed:true)
  total_length: number,        // sum of river.length over non-removed rivers
  by_type: [
    { type: string, count: number, length: number, percentage: number }
  ]
}
```

- `by_type` sorted by `count` descending, ties broken by `type` ascending.
- `percentage` = `count / total_rivers * 100`, `0` when `total_rivers` is `0`.
- Rivers with missing / non-string `type` bucket under `"unknown"`.
- Lengths: non-finite / missing treated as `0`.
- When `pack` / `pack.rivers` is missing, return `"not-ready"` sentinel; tool
  surfaces a structured error with the standard `map:generated` hint.

## Skip rules (match `list_rivers` / `find_longest_rivers`)

- `r.i === 0` (placeholder) → skip.
- `r.removed === true` → skip.
- Falsy slot → skip.

## Runtime seam

Mirror `get-feature-distribution.ts`:

- `RiverDistributionPackLike` = `{ rivers?: RawRiver[] }`.
- `readRiverDistributionFromPack(pack)` pure aggregator.
- `RiverDistributionRuntime.readDistribution()` interface.
- `defaultRiverDistributionRuntime` reads `getPack<RiverDistributionPackLike>()`.
- `createGetRiverDistributionTool(runtime?)` returns the `Tool`.
- `getRiverDistributionTool` default singleton.

## Tool surface

- `name`: `get_river_distribution`
- `input_schema`: `{ type: "object", properties: {} }` (no required params).
- Description mirrors `get_feature_distribution` — explains skip rules,
  effective-type fallback, sort order, empty-map behavior, use cases,
  read-only contract, API-key requirement.

## Tests (mirror `get-feature-distribution.test.ts`)

- Pure aggregator:
  - skips index-0 placeholder and removed rivers;
  - buckets by `river.type`, missing/empty/non-string → `"unknown"`;
  - aggregates count + summed length per type;
  - percentage = count / total_rivers * 100 (and sums to ~100);
  - sorts by count desc, type asc on ties;
  - coerces missing / non-finite length to 0;
  - returns zero totals + empty `by_type` on placeholder-only pack;
  - all-falsy slots: zero totals + empty `by_type`;
  - `"not-ready"` on missing pack / missing pack.rivers.
- Tool surface:
  - returns ok=true with well-formed payload;
  - tolerates unrelated input keys / null / undefined input;
  - surfaces "not-ready" as structured error;
  - export name + schema match.
- `defaultRiverDistributionRuntime` integration block:
  - monkey-patches `globalThis.pack`, asserts tool works end-to-end;
  - restores original pack in afterEach;
  - uses `as unknown as { ... }` casts as required.

## Registration

- Add default import in `src/ai/index.ts` alphabetically with other
  distribution tools (after `getReligionDistributionTool`, before
  `getRiverInfoTool`).
- Add `export { ... } from "./tools/get-river-distribution"` block
  mirroring the feature-distribution export.
- Register with `registry.register(getRiverDistributionTool);` near
  other distribution tools in `buildDefaultRegistry()`.

## README_AI.md

- Insert a table row near `get_feature_distribution`:
  `| get_river_distribution | <long description including API-key note
  and example prompts> | <usage strings> |`.

## Verification

- `npm run build` green.
- `npm test` green; test count increases by the number of new cases.
- `npm run lint` unchanged — 7 warnings / 1 info / 0 errors.
- Commit: `feat(ai): add get_river_distribution tool` with a short body.
