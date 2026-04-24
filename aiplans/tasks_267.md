# Tasks 267 — `get_river_distribution`

## 1. Setup
- [x] `pwd`, fast-forward master, confirm baselines (278 files / 4785 tests; 7 warn / 1 info / 0 err).

## 2. Study
- [x] `src/ai/tools/list-rivers.ts` — read pattern, skip rules (r.i 0, removed).
- [x] `src/ai/tools/set-river-type.ts` — river.type is a free-form string.
- [x] `src/ai/tools/find-longest-rivers.ts` + test — length access, test style.
- [x] `src/ai/tools/get-feature-distribution.ts` + test — exact shape to mirror.
- [x] `src/ai/tools/_shared/index.ts` — available helpers (getPack, okResult, errorResult, RawRiver).

## 3. Plan / tasks
- [x] Write `aiplans/plan_267.md`.
- [x] Write this file.

## 4. Implement

### `src/ai/tools/get-river-distribution.ts`
- [ ] `RiverDistributionEntry` (type, count, length, percentage).
- [ ] `RiverDistribution` (total_rivers, total_length, by_type).
- [ ] `RiverDistributionPackLike = { rivers?: RawRiver[] }`.
- [ ] `readRiverDistributionFromPack(pack)` — pure aggregator, returns
  `RiverDistribution | "not-ready"`.
- [ ] Effective-type mapping: `"unknown"` when type missing / empty / non-string.
- [ ] Sort by count desc, type asc on ties.
- [ ] `RiverDistributionRuntime` + `defaultRiverDistributionRuntime`.
- [ ] `createGetRiverDistributionTool(runtime?)` with detailed description
  + empty-schema.
- [ ] Export `getRiverDistributionTool` singleton.

### `src/ai/tools/get-river-distribution.test.ts`
- [ ] Fixture: `makePack()` with placeholder 0, mixed types
  (River / Stream / Creek / missing-type / Stream / removed / falsy / NaN length).
- [ ] Pure aggregator block: skip / bucket / aggregate / percentage /
  sort / coerce / zero / falsy / not-ready cases.
- [ ] Tool surface block: ok / input tolerance / not-ready error /
  export + schema shape.
- [ ] `defaultRiverDistributionRuntime` integration block with
  globalThis.pack monkey-patching and restoration; uses `as unknown as { ... }` casts.

### `src/ai/index.ts`
- [ ] `import { getRiverDistributionTool } from "./tools/get-river-distribution";`
  alphabetical position after `getReligionDistributionTool`, before
  `getReligionInfoTool` / `getRiverInfoTool`.
- [ ] `export { ... } from "./tools/get-river-distribution";` block with
  types + default + factory + aggregator.
- [ ] `registry.register(getRiverDistributionTool);` near other
  distribution tools in `buildDefaultRegistry()`.

### `README_AI.md`
- [ ] New table row near `get_feature_distribution` with API-key note
  and example prompts.

## 5. Verify
- [ ] `npm run build` succeeds.
- [ ] `npm test` green; note new test count.
- [ ] `npm run lint` unchanged (7 warn / 1 info / 0 err).

## 6. Commit
- [ ] Stage only: `src/ai/tools/get-river-distribution.ts`,
  `src/ai/tools/get-river-distribution.test.ts`, `src/ai/index.ts`,
  `README_AI.md`, `aiplans/plan_267.md`, `aiplans/tasks_267.md`.
- [ ] Commit with `feat(ai): add get_river_distribution tool` + short body.
- [ ] Report SHA.
