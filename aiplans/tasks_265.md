# Tasks 265: `get_feature_distribution`

- [ ] 1. Study `list-features.ts` (feature enumeration + placeholder
  skip), `find-largest-features.ts` (features by area + type alias),
  `get-state-distribution.ts` (distribution response shape + seam), and
  the `_shared/index.ts` helpers.
- [ ] 2. Create `src/ai/tools/get-feature-distribution.ts`:
  - Types: `FeatureDistributionEntry`
    (`{type, count, cells, area, percentage}`), `FeatureDistribution`
    (`{features_total, land_features, water_features, by_type}`),
    `FeatureDistributionPackLike`, `FeatureDistributionRuntime`.
  - `readFeatureDistributionFromPack(pack)` pure aggregator. Skips
    `pack.features[0]` placeholder and falsy / non-object slots; groups
    by effective type (`continent` when `group === "continent"`, else
    the raw `feature.type` string, else `"unknown"`); aggregates
    `count` / `cells` / `area`, plus `land_features` / `water_features`.
    Returns `FeatureDistribution | "not-ready"`.
  - Sort `by_type` descending by `count`, ascending by `type` on ties.
  - `defaultFeatureDistributionRuntime` reading
    `getPack<FeatureDistributionPackLike>()`.
  - `createGetFeatureDistributionTool(runtime)` + default
    `getFeatureDistributionTool`.
  - Input schema: `{ type: "object", properties: {} }` (no required /
    optional parameters).
  - Description mirrors `get_state_distribution` / `get_biome_distribution`
    style — long single paragraph ending with "Read-only; requires an
    Anthropic API key (see 'Getting an API key' below)."
- [ ] 3. Create `src/ai/tools/get-feature-distribution.test.ts`:
  - Fake pack fixture with continents, islands, lakes, oceans, a
    placeholder slot, a falsy slot, and a no-type-no-group entry. Use
    `as unknown as { … }` casts.
  - Pure aggregator suite covers: skips placeholder + falsy slots;
    groups by feature.type; `group === "continent"` routes to the
    `continent` group; sums cells + area; computes percentages (floats);
    sorts by count desc with ascending-type tie-break; counts land vs
    water; all-placeholders pack returns zero totals + empty array;
    unknown-type classification fallback; not-ready handling for
    missing pack / pack.features.
  - Tool-surface suite covers: `ok: true` happy path; ignores unrelated
    input keys; `not-ready` propagation; schema export (empty properties,
    no `required` array).
  - Default runtime integration block toggling `globalThis.pack`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import slot (alphabetical): `get-feature-distribution` sits between
    `get-entity-centroid` / `get-feature-info`.
  - Re-export block near the other `get-*-distribution` re-exports.
  - `registry.register(getFeatureDistributionTool)` adjacent to the
    other distribution registrations (right after
    `getBiomeDistributionTool`).
- [ ] 5. Add README_AI.md row near `get_biome_distribution`.
- [ ] 6. Verify: `npm run build` succeeds, `npm test` all pass,
  `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_feature_distribution tool`.
