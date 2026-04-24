# Tasks 259: `get_religion_distribution`

- [ ] 1. Study `list-religions.ts`, `get-religion-info.ts`,
  `find-largest-religions.ts`, `get-population-stats.ts`, and
  `_shared/index.ts` helpers.
- [ ] 2. Create `src/ai/tools/get-religion-distribution.ts`:
  - Types: `ReligionDistributionEntry`, `ReligionDistribution`,
    `ReligionDistributionPackLike`, `ReligionDistributionRuntime`.
  - `readReligionDistributionFromPack(pack, populationRate)` pure
    aggregator. Skips `religions[0]` placeholder and `removed: true`
    entries. Uses `religion.cells` / `religion.area` /
    `religion.rural` / `religion.urban`. Scales followers by
    `populationRate` with safe fallback (`rate <= 0 / NaN → 1`, matching
    `list_religions`). Sorts by `cells_count` desc. Computes
    `percentage = cells_count / total_cells × 100` (0 when
    `total_cells === 0`).
  - `defaultReligionDistributionRuntime` reading
    `getPack<ReligionDistributionPackLike>()` and
    `getGlobal<number>("populationRate")`.
  - `createGetReligionDistributionTool(runtime)` + default
    `getReligionDistributionTool`.
  - Input schema: `{ type: "object", properties: {} }` (no required /
    optional parameters).
  - Description mirrors `get_population_stats` / `list_religions` style —
    long, single paragraph, ends with "Read-only; requires an Anthropic
    API key (see 'Getting an API key' below)."
- [ ] 3. Create `src/ai/tools/get-religion-distribution.test.ts`:
  - Fake pack with religions 0–5 (placeholder at 0, three active, one
    removed, one missing optional fields), using
    `as unknown as { … }` casts.
  - Pure aggregator suite covers: skip placeholder + removed; totals;
    ordering by cells desc; percentage math; follower scaling with
    `populationRate`; fallback when rate is 0 / NaN / negative; missing
    optional fields mapped to `null`; missing numeric fields coerced to
    0; not-ready handling; empty-religions list (total_cells = 0 →
    percentage = 0 for all).
  - Tool-surface suite covers: `ok: true` happy path; ignores unrelated
    input keys; `not-ready` propagation; schema export (no `required`
    array).
  - Default runtime integration block toggling `globalThis.pack` and
    `globalThis.populationRate`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import slot after `getPopulationStatsTool`.
  - Re-export block after the `get-population-stats` re-exports.
  - `registry.register(getReligionDistributionTool)` next to
    `getPopulationStatsTool`.
- [ ] 5. Add README_AI.md row near `get_population_stats`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match
  baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_religion_distribution tool`.
