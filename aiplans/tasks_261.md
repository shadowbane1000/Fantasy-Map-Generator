# Tasks 261: `get_state_distribution`

- [ ] 1. Study `list-states.ts`, `get-state-info.ts`, `find-largest-states.ts`,
  `get-religion-distribution.ts`, and `_shared/index.ts` helpers.
- [ ] 2. Create `src/ai/tools/get-state-distribution.ts`:
  - Types: `StateDistributionEntry`, `StateDistribution`,
    `StateDistributionPackLike`, `StateDistributionRuntime`.
  - `readStateDistributionFromPack(pack, populationRate)` pure
    aggregator. Skips `states[0]` placeholder and `removed: true`
    entries. Uses `state.cells` / `state.area` / `state.rural` /
    `state.urban`. Resolves capital name via
    `pack.burgs[state.capital].name` (null when 0 / missing). Scales
    population by `populationRate` with safe fallback
    (`rate <= 0 / NaN → 1`, matching `list_states`). Sorts by
    `cells_count` desc. Computes
    `percentage = cells_count / total_cells × 100` (0 when
    `total_cells === 0`).
  - `defaultStateDistributionRuntime` reading
    `getPack<StateDistributionPackLike>()` and
    `getGlobal<number>("populationRate")`.
  - `createGetStateDistributionTool(runtime)` + default
    `getStateDistributionTool`.
  - Input schema: `{ type: "object", properties: {} }` (no required /
    optional parameters).
  - Description mirrors `get_religion_distribution` style — long, single
    paragraph, ends with "Read-only; requires an Anthropic API key
    (see 'Getting an API key' below)."
- [ ] 3. Create `src/ai/tools/get-state-distribution.test.ts`:
  - Fake pack with states 0–5 (placeholder at 0, three active, one
    removed, one missing optional fields), plus a matching `burgs`
    array for capital resolution. Use `as unknown as { … }` casts.
  - Pure aggregator suite covers: skip placeholder + removed; totals;
    ordering by cells desc; percentage math; population scaling with
    `populationRate`; fallback when rate is 0 / NaN / negative; capital
    name resolution (present / zero / missing-burg); missing optional
    fields mapped to `null`; missing numeric fields coerced to 0;
    not-ready handling; empty-states list (total_cells = 0 → percentage
    = 0 for all).
  - Tool-surface suite covers: `ok: true` happy path; ignores unrelated
    input keys; `not-ready` propagation; schema export (no `required`
    array).
  - Default runtime integration block toggling `globalThis.pack` and
    `globalThis.populationRate`.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import slot after `getReligionDistributionTool`.
  - Re-export block after the `get-religion-distribution` re-exports.
  - `registry.register(getStateDistributionTool)` next to
    `getReligionDistributionTool`.
- [ ] 5. Add README_AI.md row near `get_religion_distribution`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match
  baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_state_distribution tool`.
