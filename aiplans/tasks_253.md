# Tasks 253: `find_largest_states`

- [ ] 1. Study `find-largest-burgs.ts` + `list-states.ts` + `get-state-info.ts`.
- [ ] 2. Create `src/ai/tools/find-largest-states.ts`:
  - Export `DEFAULT_FIND_LARGEST_STATES_N = 10`, `MAX_FIND_LARGEST_STATES_N = 500`,
    `FIND_LARGEST_STATES_METRICS = ["area", "cells", "population"] as const`.
  - Types: `FindLargestStatesMetric`, `FindLargestStatesHit`,
    `FindLargestStatesPayload`, `FindLargestStatesResult`,
    `FindLargestStatesRuntime`.
  - `findLargestStatesInPack(pack, n, by)` pure ranker.
  - `defaultFindLargestStatesRuntime` reading `getPack<PackLike>()`.
  - `createFindLargestStatesTool(runtime)` + default `findLargestStatesTool`.
  - Input schema: `n: integer`, `by: string enum` (lower-cased strings).
  - Description mirrors `find_largest_burgs` style — long, single paragraph, ends
    with "Read-only; requires an Anthropic API key (see 'Getting an API key'
    below)."
- [ ] 3. Create `src/ai/tools/find-largest-states.test.ts`:
  - Fake pack with states 0–5 (mix of removed, active, neutral), using `as unknown as`
    for type casts.
  - Pure ranker suite covers each metric, n slicing, skip-removed/id-0, empty,
    not-ready.
  - Tool-surface suite covers `by` default/normalization/invalid, `n` default and
    bounds checking, not-ready propagation, schema export.
  - Default runtime integration block toggling `globalThis.pack`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Alphabetical import under the existing `find-largest-burgs` import.
  - Re-export block after the `find-largest-burgs` re-exports.
  - `registry.register(findLargestStatesTool)` next to `findLargestBurgsTool`.
- [ ] 5. Add README_AI.md row near `find_largest_burgs`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match baseline.
- [ ] 7. Commit with `feat(ai): add find_largest_states tool`.
