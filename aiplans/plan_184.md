# Plan 184 — `get_culture_info` AI tool

## Goal
Add a read-only AI tool that reports detailed info for a single culture —
parallel to `get_state_info` (just merged as plan 182) and `get_burg_info`
(plan 183). Enables the AI to drill into a specific culture before issuing
any culture-targeted action (rename_culture, set_culture_color,
set_culture_type, set_culture_base, set_culture_center,
set_culture_origins, set_culture_shield, regenerate_all_culture_names,
remove_culture, …).

## Use case
Given a culture reference (numeric id or case-insensitive name), return:
- `i` (culture id; allow 0 for Wildlands)
- `name`, `color`, `type`, `expansionism`
- `base`: `{ id, name }` resolved from `window.nameBases[culture.base]`
  (the same language-family lookup `set_culture_base` uses). `null` when
  `culture.base` is absent or `nameBases` is unavailable.
- `center`: `{ cell, x, y }` — `culture.center` cell index plus coords
  from `pack.cells.p[center]`. `null` when `culture.center` is absent.
- `origins`: plain-array copy of `culture.origins` (parent culture ids).
  Defaults to `[]` when unset.
- `cells_count` — `culture.cells` (aggregated during culture generation)
- `area` — `culture.area`
- `population_total` — rounded `(culture.rural + culture.urban) * populationRate`
  (matches `list_cultures`)
- `urban_population` — rounded `culture.urban * populationRate * urbanization`
- `rural_population` — rounded `culture.rural * populationRate`
- `burgs_count` — live count of non-removed burgs where
  `pack.cells.culture[burg.cell] === cultureI` (and `burg.i > 0`).
  Note: burgs don't carry `culture` directly as a post-load field for
  lookup convenience, but `burg.culture` does exist on the raw burg; we
  use the cell-indexed lookup per the spec to match how the Cultures
  Editor associates burgs with cultures on display. If `burg.cell` is
  missing or out of range, fall back to `burg.culture` when the raw
  property is present.
- `states_count` — count of non-removed states where
  `state.culture === cultureI` (skip state 0 which is Neutrals).
- `shield`: `culture.shield ?? null`
- `lock`: `culture.lock ?? false`

## Shape
- **Tool name**: `get_culture_info`
- **Inputs**:
  - `culture` (integer or string, required) — numeric culture id
    (>= 0; 0 = Wildlands is allowed) or case-insensitive name. String
    ref resolved via `findEntityByRef`; numeric ref looked up directly
    so id 0 works.
- **Output** (on success):
  ```
  {
    ok: true,
    i,
    name,
    color,
    type,
    expansionism,
    base:            { id, name } | null,
    center:          { cell, x, y } | null,
    origins:         number[],
    cells_count,
    area,
    population_total,
    urban_population,
    rural_population,
    burgs_count,
    states_count,
    shield,
    lock
  }
  ```
- **Errors**:
  - map not ready (no `pack`) → `Map is not ready yet. Wait for the map
    to finish generating (listen for the 'map:generated' event on window).`
  - `culture` missing / wrong type → `culture must be a non-negative
    integer id or a non-empty name string.` (via custom parse — we
    can't use `parseEntityRef` directly because it rejects id 0.)
  - no match / removed → `No culture found matching <ref>.`

Note: Unlike `get_state_info`, id 0 is a legitimate culture (Wildlands)
and must be readable.

## Runtime seam
```ts
export interface CultureInfoRuntime {
  readCulture(ref: number | string): CultureInfo | "not-ready" | "not-found";
}
export const defaultCultureInfoRuntime: CultureInfoRuntime = {
  readCulture(ref) { /* reads globalThis.pack + populationRate + urbanization + nameBases */ }
};
```

Internally a pure helper `readCultureInfoFromPack(pack, rates, nameBases, ref)`
does the work without touching globals so tests can exercise it directly.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Returns all fields for a fully populated fake culture.
2. Allows culture id 0 (Wildlands) — does not short-circuit with "not-found".
3. Resolves `base` `{id,name}` from `nameBases[culture.base]`;
   returns `null` when index is out of range; returns `null` when
   `culture.base` is absent.
4. `center` populated from `pack.cells.p[culture.center]`; `null` when
   `culture.center` is missing.
5. `origins` is copied array; defaults `[]` when absent.
6. `population_total`, `urban_population`, `rural_population` apply the
   right rates (rural*rate; urban*rate*urbanization).
7. `burgs_count` counts only burgs where
   `pack.cells.culture[burg.cell] === i` and `!removed` and `i > 0`.
8. `states_count` counts only `state.culture === i && !removed && i > 0`.
9. `shield` / `lock` pass-through with sensible defaults.
10. String-ref lookup by name (case-insensitive) resolves.
11. Unknown refs return `not-found`.
12. Returns `not-ready` when `pack` is missing.

Schema sanity:
13. `culture` is required; tool name is `get_culture_info`.
14. Non-integer / empty / wrong-type culture → validation error.

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: …; populationRate?: …;
urbanization?: …; nameBases?: … })` writes + `afterEach` restores,
mirroring the `get_state_info` test.
1. Reads a real packed culture through the default runtime.
2. Returns `"not-ready"` when `pack` is missing → tool surfaces error.
3. Returns `"not-found"` for unknown id.

## Registration
- Add `import { getCultureInfoTool } from "./tools/get-culture-info";` in
  `src/ai/index.ts`.
- Add `registry.register(getCultureInfoTool);` next to
  `registry.register(getBurgInfoTool);`.
- Add a re-export block:
  `export { createGetCultureInfoTool, defaultCultureInfoRuntime, getCultureInfoTool, type CultureInfo, type CultureInfoRuntime, readCultureInfoFromPack } from "./tools/get-culture-info";`.

## README_AI.md
Add a row immediately after `get_burg_info` — same column shape
(description with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2613 + N new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT list every burg or every cell in the culture — counts only.
  That parallels `list_cultures` staying summary-level. Use
  `get_entity_cells` for the full cell list or `list_burgs` +
  client-side filter for per-culture burg listings.
- We do NOT expose the `code` field — that's an internal legend-namespace
  abbreviation already covered by `list_cultures`.
- We do NOT decorate `origins` with parent-culture names — the AI can
  cross-walk to `list_cultures` / another `get_culture_info` call.
