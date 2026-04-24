# Tasks 254: `find_largest_cultures`

- [ ] 1. Study `find-largest-states.ts` + `list-cultures.ts` + `get-culture-info.ts`.
- [ ] 2. Create `src/ai/tools/find-largest-cultures.ts`:
  - Export `DEFAULT_FIND_LARGEST_CULTURES_N = 10`,
    `MAX_FIND_LARGEST_CULTURES_N = 500`,
    `FIND_LARGEST_CULTURES_METRICS = ["area", "cells", "population"] as const`.
  - Types: `FindLargestCulturesMetric`, `FindLargestCulturesHit`,
    `FindLargestCulturesPayload`, `FindLargestCulturesResult`,
    `FindLargestCulturesRuntime`.
  - `findLargestCulturesInPack(pack, n, by)` pure ranker. Skip `removed: true`
    and the id=0 Wildlands placeholder (matches `list_cultures` via `isActive`).
  - `defaultFindLargestCulturesRuntime` reading `getPack<PackLike>()`.
  - `createFindLargestCulturesTool(runtime)` + default `findLargestCulturesTool`.
  - Input schema: `n: integer`, `by: string enum` (lower-cased strings).
  - Description mirrors `find_largest_states` style — long, single paragraph,
    ends with "Read-only; requires an Anthropic API key (see 'Getting an API
    key' below)."
- [ ] 3. Create `src/ai/tools/find-largest-cultures.test.ts`:
  - Fake pack with cultures 0-5 (mix of removed, active, Wildlands), using
    `as unknown as` for type casts.
  - Pure ranker suite covers each metric, n slicing, skip-removed/id-0, empty,
    not-ready.
  - Tool-surface suite covers `by` default/normalization/invalid, `n` default
    and bounds checking, not-ready propagation, schema export.
  - Default runtime integration block toggling `globalThis.pack`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Alphabetical import under the existing `find-largest-burgs` /
    `find-largest-states` imports.
  - Re-export block near the `find-largest-states` re-exports.
  - `registry.register(findLargestCulturesTool)` next to
    `findLargestStatesTool`.
- [ ] 5. Add README_AI.md row near `find_largest_states`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match baseline
  (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add find_largest_cultures tool`.
