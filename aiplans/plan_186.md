# Plan 186 — `get_province_info` AI tool

## Goal
Add a read-only AI tool that reports detailed info for a single province —
parallel to `get_state_info` / `get_culture_info` / `get_religion_info`
(the per-entity drill-downs for states, cultures, and religions). Enables
the AI to drill into a specific province before issuing any
province-targeted action (`rename_province`, `set_province_capital`,
`set_province_color`, `set_province_form`, `set_province_coa_custom`,
`regenerate_province_coa`, `regenerate_province_name`,
`regenerate_all_province_names`, `remove_province`, …).

## Use case
Given a province reference (numeric id or case-insensitive name / fullName),
return:
- `i` (province id)
- `name`, `fullName`, `formName`, `color`
- `state`: `{ id, name }` from `pack.states[province.state]` (null when
  `province.state` is unset)
- `capital`: `{ id, name, x, y }` from `pack.burgs[province.burg]` when
  `province.burg > 0` (null when there is no capital burg). Mirrors how
  `get_state_info` handles `state.capital` — including echoing the id
  when the slot points at a removed burg.
- `center`: `{ cell, x, y }` — `province.center` cell index plus coords from
  `pack.cells.p[center]`; `null` when `province.center` is absent.
- `cells_count` — count of cells where `pack.cells.province[c] === i`
  (derived; `RawProvince` doesn't track `.cells` directly).
- `area` — sum of `pack.cells.area[c]` for those cells when available,
  otherwise just reported as 0 (provinces don't cache area on the
  entry itself). For parity with `get_state_info`, if `pack.cells.area`
  isn't available we still report an integer 0 instead of null.
- `population_total` — rounded sum of per-cell populations on this
  province: for each matching cell, `(cells.pop[c] + burg-pop-if-capital)
  * populationRate`. Simpler fallback: derive total = urban + rural.
- `urban_population` — rounded sum of `burg.population * populationRate * urbanization`
  over non-removed burgs within this province.
- `rural_population` — rounded sum of `cells.pop[c] * populationRate`
  over matching province cells (same convention `list_burgs` / `list_states`
  use for "rural").
- `burgs`: array of `{ id, name }` of non-removed burgs within the
  province (where `pack.cells.province[burg.cell] === provinceI` and
  `burg.i > 0`). Ordered by burg id for determinism.
- `coa`: `{ present: boolean, custom: boolean }` — mirrors the
  `coa` object used by `regenerate_province_coa` / `set_province_coa_custom`.
- `lock`: `province.lock ?? false`

For province 0 (placeholder) we explicitly surface an error, matching
the `get_state_info` pattern for state 0 / Neutrals.

## Shape
- **Tool name**: `get_province_info`
- **Inputs**:
  - `province` (integer or string, required) — numeric province id (> 0)
    or case-insensitive name / fullName. Uses the shared `findEntityByRef`,
    which skips the index-0 placeholder and any `removed: true` entries.
- **Output** (on success):
  ```
  {
    ok: true,
    i,
    name,
    fullName,
    formName,
    color,
    state:   { id, name } | null,
    capital: { id, name, x, y } | null,
    center:  { cell, x, y } | null,
    cells_count,
    area,
    population_total,
    urban_population,
    rural_population,
    burgs:   Array<{ id, name }>,
    coa:     { present: boolean, custom: boolean },
    lock:    boolean
  }
  ```
- **Errors**:
  - map not ready (no `pack`) → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - `province` missing / wrong type → `province must be a positive integer id or a non-empty name string.` (via `parseEntityRef`)
  - province 0 (placeholder) → `Cannot read info for province 0 (the placeholder entry).`
  - no match / removed → `No province found matching <ref>.`

## Runtime seam
```ts
export interface ProvinceInfoRuntime {
  readProvince(ref: number | string): ProvinceInfo | "not-ready" | "not-found" | "placeholder";
}
export const defaultProvinceInfoRuntime: ProvinceInfoRuntime = {
  readProvince(ref) { /* reads globalThis.pack + populationRate + urbanization */ }
};
```

Internally a pure helper `readProvinceInfoFromPack(pack, rates, ref)` does
the work without touching globals so tests can exercise it directly.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Returns all fields for a fully populated fake province.
2. Resolves state `{id,name}` from `pack.states[province.state]`;
   `null` when `province.state` is unset.
3. `capital` populated from `pack.burgs[province.burg]` when `burg > 0`;
   `null` when unset; id-echo with nulls when burg is removed.
4. `center` populated from `pack.cells.p[province.center]`; `null` when
   `province.center` is missing.
5. `cells_count` counts cells where `pack.cells.province[c] === i`.
6. `burgs` lists only non-removed burgs within the province
   (`pack.cells.province[burg.cell] === i && !removed && burg.i > 0`),
   as `{id, name}`, sorted by id.
7. Population totals apply the right rates (rural=sum(cells.pop)*rate;
   urban=sum(burg.population)*rate*urbanization; total=urban+rural).
8. `coa.present` / `coa.custom` mirror `province.coa` / `province.coa.custom`.
9. `lock` pass-through; defaults `false`.
10. String-ref lookup by `name` / `fullName` (case-insensitive) resolves.
11. Unknown / removed refs return `"not-found"`; province 0 returns
    `"placeholder"`.
12. Returns `"not-ready"` when `pack` is missing or `pack.provinces` is
    missing.

Schema sanity:
13. `province` is required; tool name is `get_province_info`.
14. Non-integer / missing province → parseEntityRef error.
15. Province-0 input rejected at the tool layer with a clear message.

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: …; populationRate?: …; urbanization?: … })`
writes + `afterEach` restores, mirroring the `get_state_info` /
`get_culture_info` tests.
1. Reads a real packed province through the default runtime.
2. Returns `"not-ready"` when `pack` is missing → tool surfaces error.
3. Returns `"not-found"` for unknown id.

## Registration
- Add `import { getProvinceInfoTool } from "./tools/get-province-info";` in
  `src/ai/index.ts`.
- Add `registry.register(getProvinceInfoTool);` next to
  `registry.register(getStateInfoTool);` / `getReligionInfoTool`.
- Add a re-export block:
  `export { createGetProvinceInfoTool, defaultProvinceInfoRuntime,
    getProvinceInfoTool, type ProvinceInfo, type ProvinceInfoRuntime,
    readProvinceInfoFromPack } from "./tools/get-province-info";`.

## README_AI.md
Add a row after the `get_state_info` / `get_religion_info` / `get_culture_info`
row — same column shape (description with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2659 + N new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT list every cell; just `cells_count` + the derived
  `rural_population`. Use `get_entity_cells` for the full cell list
  when the caller needs per-cell data.
- `burgs` lists non-removed burgs within the province but is not
  paginated — provinces typically hold only a handful of burgs, so
  listing them inline matches how `get_state_info` lists provinces.
- We do NOT resolve `pole` coords in this tool (that's already part of
  `list_provinces`); `center` + `capital` coords are what actions need.
