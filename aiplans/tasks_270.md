# Tasks 270 — `get_route_distribution`

## 1. Setup
- [x] `pwd`, fast-forward master, confirm baselines (282 files / 4875 tests; 7 warn / 1 info / 0 err).

## 2. Study
- [x] `src/ai/tools/list-routes.ts` — read pattern, ROUTE_GROUPS, skip rules (removed).
- [x] `src/ai/tools/find-routes-by-group.ts` + test — group filter & canonicalisation.
- [x] `src/ai/tools/get-burg-distribution.ts` + test — distribution analog.
- [x] `src/ai/tools/get-river-distribution.ts` + test — exact shape to mirror.
- [x] `src/ai/tools/_shared/index.ts` — helpers (getPack, okResult, errorResult, RawRoute).

## 3. Plan / tasks
- [x] Write `aiplans/plan_270.md`.
- [x] Write this file.

## 4. Implement

### `src/ai/tools/get-route-distribution.ts`
- [ ] `RouteDistributionEntry` (group, count, points, percentage).
- [ ] `RouteDistribution` (total_routes, total_points, by_group).
- [ ] `RouteDistributionPackLike = { routes?: RawRoute[] }`.
- [ ] `readRouteDistributionFromPack(pack)` — pure aggregator, returns
  `RouteDistribution | "not-ready"`.
- [ ] Effective-group mapping: `"unknown"` when group missing / empty / non-string.
- [ ] Sort by count desc, group asc on ties.
- [ ] `RouteDistributionRuntime` + `defaultRouteDistributionRuntime`.
- [ ] `createGetRouteDistributionTool(runtime?)` with detailed description + empty-schema.
- [ ] Export `getRouteDistributionTool` singleton.

### `src/ai/tools/get-route-distribution.test.ts`
- [ ] Fixture: `makePack()` with mixed groups (roads / trails / searoutes /
  missing / non-string / empty / removed / falsy / non-array points).
- [ ] Pure aggregator block: skip / bucket / aggregate / percentage /
  sort / coerce / zero / falsy / not-ready cases.
- [ ] Tool surface block: ok / input tolerance / not-ready error /
  export + schema shape.
- [ ] `defaultRouteDistributionRuntime` integration block with
  globalThis.pack monkey-patching and restoration; uses `as unknown as { ... }` casts.

### `src/ai/index.ts`
- [ ] `import { getRouteDistributionTool } from "./tools/get-route-distribution";`
  alphabetical position after `getRiverDistributionTool` or near
  `getRouteInfoTool`.
- [ ] `export { ... } from "./tools/get-route-distribution";` block with
  types + default + factory + aggregator.
- [ ] `registry.register(getRouteDistributionTool);` near other
  distribution tools in `buildDefaultRegistry()`.

### `README_AI.md`
- [ ] New table row near `get_river_distribution` with API-key note
  and example prompts.

## 5. Verify
- [ ] `npm run build` succeeds.
- [ ] `npm test` green; note new test count.
- [ ] `npm run lint` unchanged (7 warn / 1 info / 0 err).

## 6. Commit
- [ ] Stage only: `src/ai/tools/get-route-distribution.ts`,
  `src/ai/tools/get-route-distribution.test.ts`, `src/ai/index.ts`,
  `README_AI.md`, `aiplans/plan_270.md`, `aiplans/tasks_270.md`.
- [ ] Commit with `feat(ai): add get_route_distribution tool` + short body.
- [ ] Report SHA.
