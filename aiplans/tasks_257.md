# Tasks 257: `find_largest_features`

- [ ] 1. Study `find-largest-states.ts`, `find-largest-cultures.ts`,
  `list-features.ts`, and `get-feature-info.ts`.
- [ ] 2. Create `src/ai/tools/find-largest-features.ts`:
  - Export `DEFAULT_FIND_LARGEST_FEATURES_N = 10`,
    `MAX_FIND_LARGEST_FEATURES_N = 500`,
    `FIND_LARGEST_FEATURES_METRICS = ["area", "cells"] as const`,
    `FIND_LARGEST_FEATURES_TYPE_FILTERS = ["island", "lake", "ocean",
    "continent"] as const`.
  - Types: `FindLargestFeaturesMetric`, `FindLargestFeaturesTypeFilter`,
    `FindLargestFeaturesHit`, `FindLargestFeaturesPayload`,
    `FindLargestFeaturesResult`, `FindLargestFeaturesRuntime`.
  - `findLargestFeaturesInPack(pack, n, by, typeFilter)` pure ranker.
    Skips `features[0]` placeholder and any non-object slot; filters by
    type if set (`continent` matches `group === "continent"`, others match
    `type === filter`).
  - `defaultFindLargestFeaturesRuntime` reading `getPack<PackLike>()`.
  - `createFindLargestFeaturesTool(runtime)` + default
    `findLargestFeaturesTool`.
  - Input schema: `n: integer`, `by: string enum`, `type: string enum`
    (lower-cased strings).
  - Description mirrors `find_largest_states` / `list_features` style —
    long, single paragraph, ends with "Read-only; requires an Anthropic
    API key (see 'Getting an API key' below)."
- [ ] 3. Create `src/ai/tools/find-largest-features.test.ts`:
  - Fake pack with features 0–5 (mix of continents, islands, lakes, ocean,
    placeholder / undefined slot), using `as unknown as` for type casts.
  - Pure ranker suite covers each metric, n slicing, skip-placeholder,
    type filter, combined type + rank, empty, not-ready, missing-field
    coercion.
  - Tool-surface suite covers `by` default/normalization/invalid, `type`
    case-insensitivity/invalid, `n` default and bounds, not-ready
    propagation, schema export.
  - Default runtime integration block toggling `globalThis.pack`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Alphabetical import slot near existing `findLargest*` imports.
  - Re-export block after the `find-largest-cultures` re-exports.
  - `registry.register(findLargestFeaturesTool)` next to the other
    `findLargest*` registrations.
- [ ] 5. Add README_AI.md row near `list_features`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match
  baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add find_largest_features tool`.
