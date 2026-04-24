# Tasks 260: `get_culture_distribution`

- [ ] 1. Study `get-religion-distribution.ts`, `get-biome-distribution.ts`,
  `list-cultures.ts`, `get-culture-info.ts`,
  `find-largest-cultures.ts`, `_shared/index.ts` helpers.
- [ ] 2. Create `src/ai/tools/get-culture-distribution.ts`:
  - Types: `CultureDistributionEntry`, `CultureDistribution`,
    `CultureDistributionPackLike`, `CultureDistributionRuntime`.
  - `readCultureDistributionFromPack(pack, populationRate)` pure
    aggregator. Skips `removed: true` entries only (INCLUDES culture 0 =
    Wildlands). Uses `culture.cells` / `culture.area` / `culture.rural` /
    `culture.urban`. Scales population by `populationRate` with safe
    fallback (`rate <= 0 / NaN → 1`, matching `list_cultures`). Sorts by
    `cells_count` desc. Computes `percentage = cells_count /
    total_cells × 100` (0 when `total_cells === 0`).
  - `defaultCultureDistributionRuntime` reading
    `getPack<CultureDistributionPackLike>()` and
    `getGlobal<number>("populationRate")`.
  - `createGetCultureDistributionTool(runtime)` + default
    `getCultureDistributionTool`.
  - Input schema: `{ type: "object", properties: {} }` (no required /
    optional parameters).
  - Description mirrors `get_religion_distribution` style — long, single
    paragraph, explicitly notes that culture 0 (Wildlands) IS included.
    Ends with "Read-only; requires an Anthropic API key (see 'Getting an
    API key' below)."
- [ ] 3. Create `src/ai/tools/get-culture-distribution.test.ts`:
  - Fake pack with cultures 0–5 (Wildlands at 0, three active, one
    removed, one missing optional fields), using
    `as unknown as { … }` casts.
  - Pure aggregator suite covers: includes Wildlands (culture 0); skips
    removed; totals; ordering by cells desc; percentage math; population
    scaling with `populationRate`; fallback when rate is 0 / NaN /
    negative; missing optional fields mapped to `null`; missing numeric
    fields coerced to 0; not-ready handling; empty-cultures list
    (total_cells = 0 → percentage = 0 for all).
  - Tool-surface suite covers: `ok: true` happy path; ignores unrelated
    input keys; `not-ready` propagation; schema export (no `required`
    array).
  - Default runtime integration block toggling `globalThis.pack` and
    `globalThis.populationRate`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import slot after `getReligionDistributionTool` (or in alphabetical
    order near `getCultureInfoTool`).
  - Re-export block near the `get-culture-info` / `get-religion-distribution`
    re-exports.
  - `registry.register(getCultureDistributionTool)` next to
    `getReligionDistributionTool`.
- [ ] 5. Add README_AI.md row near `get_religion_distribution`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match
  baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_culture_distribution tool`.
