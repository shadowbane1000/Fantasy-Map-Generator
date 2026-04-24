# Tasks 264: `get_province_distribution`

- [ ] 1. Study `find-largest-provinces.ts` (derivation of cells / area /
  rural / urban per province), `get-state-distribution.ts`
  (distribution shape + runtime seam), `get-province-info.ts`
  (per-province scan), and the `_shared/index.ts` helpers.
- [ ] 2. Create `src/ai/tools/get-province-distribution.ts`:
  - Types: `ProvinceDistributionEntry`
    ({i, name, fullName, formName, color, cells_count, percentage,
    area, population}), `ProvinceDistribution`
    ({total_cells, total_population, provinces}),
    `ProvinceDistributionPackLike` (subset of `PackLike` from
    `find-largest-provinces.ts`), `ProvinceDistributionRuntime`
    ({readDistribution()}).
  - `readProvinceDistributionFromPack(pack)` pure aggregator.
    - Build `Map<number, { cellsCount, area, ruralRaw, urbanRaw }>`
      keyed by province id by walking `pack.cells.province` once
      (skip `pid <= 0`), adding to `cellsCount`, `area`, `ruralRaw`.
    - Walk `pack.burgs` once: skip removed / index-0 / out-of-range
      cell; look up `pid = cells.province[burg.cell]`; skip
      `pid <= 0`; add `burg.population` to `urbanRaw`.
    - Walk `pack.provinces`; skip `i === 0` and `removed`. Build
      entries with derived aggregates (`area`, `population`
      `Math.max(0, Math.round(...))`; `population = ruralRaw +
      urbanRaw` **raw**).
    - Accumulate `total_cells` and `total_population`.
    - Compute `percentage`. Sort by `cells_count` desc.
    - Returns `ProvinceDistribution | "not-ready"`.
  - `defaultProvinceDistributionRuntime` reading
    `getPack<ProvinceDistributionPackLike>()`.
  - `createGetProvinceDistributionTool(runtime)` + default
    `getProvinceDistributionTool`.
  - Input schema: `{ type: "object", properties: {} }`.
  - Description mirrors `get_state_distribution` style — long, single
    paragraph; ends with "Read-only ... Requires an Anthropic API key
    (see 'Getting an API key' below).". Clearly notes that province
    fields are derived (not pre-aggregated) and that population is
    raw (vs `get_province_info.population_total` which is scaled).
- [ ] 3. Create `src/ai/tools/get-province-distribution.test.ts`:
  - Fake pack with mixed provinces (placeholder id-0, normal, removed,
    missing optional fields, no cells). Use `as unknown as { … }`
    casts.
  - Pure aggregator suite covers: skips id-0 + removed; sorts by
    cells_count desc; total_cells derived from active provinces;
    total_population raw rural+urban; percentage math (including
    zero-total case); missing fields → `null`; missing cells / burgs
    → 0; removed burgs excluded from urban; burgs on province 0
    excluded; not-ready on missing pack / pack.provinces.
  - Tool-surface suite covers: `ok: true` happy path; ignores
    unrelated input keys; surfaces `not-ready` error; exported tool
    with expected schema (empty properties, no `required`).
  - Default runtime integration block toggling `globalThis.pack`;
    happy path + missing pack.
- [ ] 4. Register in `src/ai/index.ts`:
  - Import slot after `getProvinceInfoTool` (alphabetical).
  - Re-export block next to `get-province-info` re-exports.
  - `registry.register(getProvinceDistributionTool)` next to
    `getStateDistributionTool`.
- [ ] 5. Add README_AI.md row near `get_state_distribution`.
- [ ] 6. Verify: `npm run build`, `npm test`, `npm run lint` match
  baseline (7 warnings / 1 info / 0 errors).
- [ ] 7. Commit with `feat(ai): add get_province_distribution tool`.
