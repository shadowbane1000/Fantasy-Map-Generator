# Tasks 266: `get_burg_distribution`

- [ ] 1. Study `list-marker-types.ts` (group-by-type analog),
  `find-burgs-by-type.ts` (BURG_TYPES + canonical resolution),
  `get-population-stats.ts` (population scaling via `populationRate ×
  urbanization`), `get-feature-distribution.ts` (aggregate response
  shape + runtime seam), `get-state-distribution.ts` (distribution
  scaling pattern), and the `_shared/index.ts` helpers.
- [ ] 2. Create `src/ai/tools/get-burg-distribution.ts`:
  - Types: `BurgDistributionEntry` (`{type, count, population,
    percentage}`), `BurgDistribution` (`{total_burgs, total_population,
    by_type}`), `BurgDistributionPackLike`, `BurgDistributionRates`,
    `BurgDistributionRuntime`.
  - `readBurgDistributionFromPack(pack, rates)` pure aggregator. Skips
    `i === 0` placeholder and `removed: true` burgs; groups by canonical
    burg type (via `resolveBurgType`) with missing / non-canonical /
    non-string / empty `type` rolled into the `"Generic"` bucket.
    Accumulates `count` and scaled `population` (`raw × populationRate ×
    urbanization`, rounded). Returns `BurgDistribution | "not-ready"`.
  - Pre-seed the bucket map with every canonical `BURG_TYPES` entry so
    ordering/casing stays canonical even when a bucket is empty — but
    only emit buckets whose `count > 0` in the output (empty types
    filtered out) so the result mirrors what actually exists on the
    map.
  - Sort `by_type` descending by `count`, ascending by canonical `type`
    on ties.
  - `defaultBurgDistributionRuntime` reading
    `getPack<BurgDistributionPackLike>()`, plus `populationRate` /
    `urbanization` globals (fallback `1`).
  - `createGetBurgDistributionTool(runtime)` + default
    `getBurgDistributionTool`.
  - Input schema: `{ type: "object", properties: {} }` (no required /
    optional parameters).
  - Description mirrors `get_feature_distribution` /
    `get_state_distribution` style — long single paragraph ending with
    "Read-only; requires an Anthropic API key (see 'Getting an API key'
    below)."
- [ ] 3. Create `src/ai/tools/get-burg-distribution.test.ts`:
  - Fake pack fixture with a mix of burg types (Generic / Naval /
    River / Highland), a legacy-cased entry (`"generic"`), a removed
    burg, a missing-type burg, a non-canonical typed burg, and the
    index-0 placeholder. Use `as unknown as { … }` casts.
  - Pure aggregator suite covers: skips placeholder + removed burgs;
    merges case-insensitive burg types into canonical buckets;
    missing / empty / non-canonical types rolled into `"Generic"`;
    scales population with `populationRate × urbanization` (rounded);
    computes percentages (floats summing ~100); sorts by count desc
    with ascending-type tie-break; all-placeholders pack returns zero
    totals + empty array; not-ready handling for missing pack /
    pack.burgs.
  - Tool-surface suite covers: `ok: true` happy path; ignores unrelated
    input keys; `not-ready` propagation; schema export (empty
    properties, no `required` array).
  - Default runtime integration block toggling `globalThis.pack`,
    `globalThis.populationRate`, `globalThis.urbanization`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import slot (alphabetical): `get-burg-distribution` sits before
    `get-burg-info`.
  - Re-export block near the other `get-*-distribution` re-exports.
  - `registry.register(getBurgDistributionTool)` adjacent to other
    distribution registrations (right after `getFeatureDistributionTool`).
- [ ] 5. Add README_AI.md row near `get_feature_distribution`.
- [ ] 6. Verify: `npm run build` succeeds, `npm test` all pass,
  `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_burg_distribution tool`.
