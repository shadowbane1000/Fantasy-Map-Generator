# Plan 185 — `get_religion_info` AI tool

## Goal
Add a read-only AI tool that reports detailed info for a single religion —
parallel to `get_state_info` / `get_culture_info` (which are the per-entity
drill-downs for states and cultures). Enables the AI to drill into a
specific religion before issuing any religion-targeted action
(rename_religion, set_religion_color, set_religion_type, set_religion_form,
set_religion_deity, set_religion_expansion, set_religion_culture,
set_religion_center, set_religion_origins, regenerate_religion_names,
remove_religion, …).

## Use case
Given a religion reference (numeric id or case-insensitive name), return:
- `i` (religion id)
- `name`, `color`, `type`, `form`, `deity`, `code`
- `expansion` (mode: "global" | "state" | "culture" | raw string)
- `expansionism` (number)
- `culture`: `{ id, name }` from `pack.cultures[religion.culture]` (null when
  missing / out of range, i.e. `religion.culture` undefined)
- `center`: `{ cell, x, y }` — `religion.center` cell index plus coords from
  `pack.cells.p[center]` — `null` when `religion.center` is absent
- `origins`: array of parent religion ids (passed through as `religion.origins ?? []`)
- `cells_count` — `religion.cells`
- `area` — `religion.area`
- `population_total` — rounded `(religion.rural + religion.urban) * populationRate`
  (matches what `list_religions` returns)
- `urban_population` — rounded `religion.urban * populationRate * urbanization`
- `rural_population` — rounded `religion.rural * populationRate`
- `burgs_count` — live count of burgs where
  `pack.cells.religion[burg.cell] === religionI` and `!burg.removed` and
  `burg.i > 0` (religions aren't stored on burgs directly; see `get_burg_info`).
- `states_count` — number of distinct states that "carry" this religion,
  best-effort: count of non-removed states whose `capital` burg sits on a
  cell with `cells.religion === religionI`. This matches how the Religions
  Editor surfaces state-level affiliation — each state has a single
  effective religion via its capital. Alternative (if no `cells.religion`
  array is available): count of states whose capital-burg religion
  matches by walking `pack.cells.religion[burg.cell]`.
- `lock`: `religion.lock ?? false`

For religion 0 ("No religion" placeholder) we explicitly surface an
error, matching the state-info pattern for state 0 / Neutrals.

## Shape
- **Tool name**: `get_religion_info`
- **Inputs**:
  - `religion` (integer or string, required) — numeric religion id (> 0)
    or case-insensitive name. Uses the shared `findEntityByRef`, which
    skips the index-0 placeholder and any `removed: true` entries.
- **Output** (on success):
  ```
  {
    ok: true,
    i,
    name,
    color,
    type, form, deity, code,
    expansion, expansionism,
    culture:       { id, name } | null,
    center:        { cell, x, y } | null,
    origins:       number[],
    cells_count,
    area,
    population_total,
    urban_population,
    rural_population,
    burgs_count,
    states_count,
    lock:          boolean
  }
  ```
- **Errors**:
  - map not ready (no `pack`) → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - `religion` missing / wrong type → `religion must be a positive integer id or a non-empty name string.` (via `parseEntityRef`)
  - religion 0 (No religion) → `Cannot read info for religion 0 (the 'No religion' placeholder).`
  - no match / removed → `No religion found matching <ref>.`

## Runtime seam
```ts
export interface ReligionInfoRuntime {
  readReligion(ref: number | string): ReligionInfo | "not-ready" | "not-found" | "placeholder";
}
export const defaultReligionInfoRuntime: ReligionInfoRuntime = {
  readReligion(ref) { /* reads globalThis.pack + populationRate + urbanization */ }
};
```

Internally a pure helper `readReligionInfoFromPack(pack, rates, ref)` does
the work without touching globals so tests can exercise it directly.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Returns all fields for a fully populated fake religion.
2. Resolves culture `{id,name}` from `pack.cultures[religion.culture]`;
   returns `{id, name: null}` when culture id is out of range; `null` when
   `religion.culture` is undefined.
3. `center` populated from `pack.cells.p[religion.center]`; `null` when
   `religion.center` is missing.
4. `origins` passes through as `religion.origins ?? []`.
5. `population_total`, `urban_population`, `rural_population` apply the
   right rates (rural*rate; urban*rate*urbanization).
6. `burgs_count` counts only burgs where
   `pack.cells.religion[burg.cell] === i && !removed && i > 0` — skips
   placeholder index-0 burg and removed burgs.
7. `states_count` counts non-removed states whose capital-burg sits on a
   cell whose `cells.religion` equals this religion id (best-effort).
8. `lock` pass-through; defaults `false`.
9. String-ref lookup by `name` (case-insensitive) resolves.
10. Unknown / removed refs return `not-found`; religion-0 returns `placeholder`.
11. Returns `not-ready` when `pack` is missing or when `pack.religions` is missing.

Schema sanity:
12. `religion` is required; tool name is `get_religion_info`.
13. Non-integer / missing religion → parseEntityRef error.
14. Religion-0 input rejected at the tool layer with a clear message.

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: …; populationRate?: …; urbanization?: … })`
writes + `afterEach` restores, mirroring the `get_state_info` / `get_cell_info` tests.
1. Reads a real packed religion through the default runtime.
2. Returns `"not-ready"` when `pack` is missing → tool surfaces error.
3. Returns `"not-found"` for unknown id.

## Registration
- Add `import { getReligionInfoTool } from "./tools/get-religion-info";` in
  `src/ai/index.ts`.
- Add `registry.register(getReligionInfoTool);` next to
  `registry.register(getStateInfoTool);` / `registry.register(getCultureInfoTool);`.
- Add a re-export block:
  `export { createGetReligionInfoTool, defaultReligionInfoRuntime, getReligionInfoTool, type ReligionInfo, type ReligionInfoRuntime, readReligionInfoFromPack } from "./tools/get-religion-info";`.

## README_AI.md
Add a row after the `get_state_info` / (eventual) `get_culture_info` row —
same column shape (description with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2613 + N new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT list every burg or every cell in the religion — counts only.
  That parallels `list_religions` / `get_state_info` staying summary-level.
  Use `get_entity_cells` for the full cell list.
- `states_count` is a best-effort derived number (capital-burg cell's
  `cells.religion`). Religions don't have a first-class `states[]` field
  in `RawReligion`, so we don't invent one.
- We do NOT attempt to display any derived theological meta (e.g. parent
  religion names) — just raw `origins` ids. The caller can chain
  `get_religion_info` on each origin id to walk the tree.
