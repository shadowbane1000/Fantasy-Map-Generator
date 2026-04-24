# Plan 248 — `find_cultures_in_area`

## Goal

Add a new read-only AI tool `find_cultures_in_area` that lists cultures whose center-cell position (`pack.cells.p[culture.center]`) falls inside a rectangular or circular area. Parallel to `find_states_in_area`, `find_provinces_in_area`, `find_burgs_in_area`.

## Analogs

- `src/ai/tools/find-states-in-area.ts` — direct template (area geometry, rect/circle mutual exclusivity, limit handling).
- `src/ai/tools/find-provinces-in-area.ts` — another in-area analog (simpler shape).
- `src/ai/tools/list-cultures.ts` — culture enumeration.
- `src/ai/tools/get-culture-info.ts` — culture.center field (CenterRef shape from `pack.cells.p`).
- `src/ai/tools/find-cultures-by-type.ts` — per-culture hit shape for `{i, name, color, …}`.
- `src/ai/tools/_shared/pack-types.ts` — `RawCulture` schema (center, color, type).

## Position resolution

Per culture (skip `removed: true`; allow culture 0 / Wildlands IF its center resolves — consistent with `get_culture_info` which permits culture 0):
1. If `culture.center` is a number and `pack.cells.p[culture.center]` yields a valid `[x, y]` pair → use it.
2. Else skip.

Cultures don't have a `pole` field, so no pole fallback. Position is simply the center-cell centroid.

## Tool shape

- Name: `find_cultures_in_area`.
- Inputs (mutually-exclusive rectangle vs. circle):
  - Rectangle: `x1`, `y1`, `x2`, `y2` (finite numbers, corners normalised).
  - Circle coords: `x`, `y`, `radius`.
  - Circle cell: `cell`, `radius`.
  - Optional `limit` (int [1, 100000], default 10000).
- Output: `{ ok, cultures: [{i, name, color, type, x, y, distance}], count, area }`.
  - `distance` populated for circle queries, null for rectangle queries.
  - Empty match is still `ok: true`.

## Error modes

- Missing pack / `pack.cultures` → `not-ready`.
- Out-of-bounds `cell` → `out-of-bounds`.
- Cell with no coords → `no-cell-point`.
- Both rect+circle params supplied → reject.
- Neither form supplied → reject.
- Incomplete rectangle → reject.
- Non-finite coords → reject.
- Missing / non-finite / negative `radius` → reject.
- Out-of-range `limit` → reject.

## Files

1. `src/ai/tools/find-cultures-in-area.ts` — pure scanner + seam + tool factory.
2. `src/ai/tools/find-cultures-in-area.test.ts` — mirrored test coverage plus `defaultFindCulturesInAreaRuntime` integration block.
3. `src/ai/index.ts` — import / re-export / register near `findCulturesByTypeTool`.
4. `README_AI.md` — add a row near `find_states_in_area`.

## Verification

- `npm run build` succeeds.
- `npm test` all pass (baseline 4304 → expected ~4340).
- `npm run lint` baseline preserved (7 warnings / 1 info / 0 errors).
