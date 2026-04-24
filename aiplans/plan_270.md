# Plan 270 — `get_route_distribution`

## Summary

New read-only AI tool that aggregates `pack.routes` by `route.group`
(roads / trails / searoutes) and returns per-group counts, summed
points, and percentage of the active route population. Parallel in
shape and conventions to `get_river_distribution` and
`get_burg_distribution` — but groups by the canonical `route.group`
(not a free-form type) and totals `route.points.length` (segment-path
count) in place of length / population.

## Payload shape

```ts
{
  ok: true,
  total_routes: number,        // count of non-removed routes
  total_points: number,        // sum of route.points.length over non-removed routes
  by_group: [
    { group: string, count: number, points: number, percentage: number }
  ]
}
```

- `by_group` sorted by `count` descending, ties broken by `group` ascending.
- `percentage` = `count / total_routes * 100`, `0` when `total_routes` is `0`.
- Routes with missing / non-string / empty `group` bucket under `"unknown"`.
- Points: missing / non-array `route.points` counted as `0`.
- When `pack` / `pack.routes` is missing, return `"not-ready"` sentinel;
  tool surfaces a structured error with the standard `map:generated` hint.

## Skip rules (match `list_routes` / `find_routes_by_group`)

- `r.removed === true` → skip.
- Falsy slot (null / undefined) → skip.
- Routes do NOT have a placeholder at index 0 — route ids are
  non-contiguous and `route.i === 0` is a real route. No id-0 skip.

## Runtime seam

Mirror `get-river-distribution.ts`:

- `RouteDistributionPackLike` = `{ routes?: RawRoute[] }`.
- `readRouteDistributionFromPack(pack)` pure aggregator.
- `RouteDistributionRuntime.readDistribution()` interface.
- `defaultRouteDistributionRuntime` reads `getPack<RouteDistributionPackLike>()`.
- `createGetRouteDistributionTool(runtime?)` returns the `Tool`.
- `getRouteDistributionTool` default singleton.

## Tool surface

- `name`: `get_route_distribution`
- `input_schema`: `{ type: "object", properties: {} }` (no required params).
- Description mirrors `get_river_distribution` / `get_burg_distribution`
  — explains skip rules, effective-group fallback, sort order, empty-map
  behavior, use cases, read-only contract, API-key requirement.

## Tests (mirror `get-river-distribution.test.ts`)

- Pure aggregator:
  - skips removed routes and falsy slots;
  - buckets by `route.group`, missing / empty / non-string → `"unknown"`;
  - aggregates count + summed points per group;
  - percentage = count / total_routes * 100 (and sums to ~100);
  - sorts by count desc, group asc on ties;
  - coerces missing / non-array points to 0;
  - returns zero totals + empty `by_group` on empty pack;
  - all-falsy slots: zero totals + empty `by_group`;
  - `"not-ready"` on missing pack / missing pack.routes.
- Tool surface:
  - returns ok=true with well-formed payload;
  - tolerates unrelated input keys / null / undefined input;
  - surfaces "not-ready" as structured error;
  - export name + schema match.
- `defaultRouteDistributionRuntime` integration block:
  - monkey-patches `globalThis.pack`, asserts tool works end-to-end;
  - restores original pack in afterEach;
  - uses `as unknown as { ... }` casts as required.

## Registration

- Add default import in `src/ai/index.ts` alphabetically with other
  distribution tools (after `getRiverDistributionTool`, before
  `getRiverInfoTool`).
- Add `export { ... } from "./tools/get-route-distribution"` block
  mirroring the river-distribution export.
- Register with `registry.register(getRouteDistributionTool);` near
  other distribution tools in `buildDefaultRegistry()`.

## README_AI.md

- Insert a table row near `get_river_distribution`:
  `| get_route_distribution | <long description including API-key note
  and example prompts> | <usage strings> |`.

## Verification

- `npm run build` green.
- `npm test` green; test count increases by the number of new cases.
- `npm run lint` unchanged — 7 warnings / 1 info / 0 errors.
- Commit: `feat(ai): add get_route_distribution tool` with a short body.
