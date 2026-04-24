# Plan 244 — `find_provinces_in_area`

## Goal

Add a new read-only AI tool `find_provinces_in_area` that lists provinces whose position (pole preferred, else center cell centroid) falls inside a rectangular or circular area. Parallel to `find_burgs_in_area`, `find_markers_in_area`, `find_rivers_in_area`.

## Analogs

- `src/ai/tools/find-burgs-in-area.ts` — primary template (rect + circle area, cell center, limit).
- `src/ai/tools/find-rivers-in-area.ts` — closely mirrored (positions via `pack.cells.p`).
- `src/ai/tools/find-markers-in-area.ts` — also area-based filter.
- `src/ai/tools/list-provinces.ts` — province enumeration, `readProvincesFromPack`.
- `src/ai/tools/get-province-info.ts` — province.pole / province.center usage.

## Position resolution

Per province (skip `i === 0` and `removed: true`):
1. If `province.pole` is a `[number, number]` → use it.
2. Else if `province.center` is a valid cell → read `pack.cells.p[province.center]`.
3. Else skip.

## Tool shape

- Name: `find_provinces_in_area`.
- Inputs (mutually-exclusive rectangle vs. circle):
  - Rectangle: `x1`, `y1`, `x2`, `y2` (finite numbers, normalised).
  - Circle coords: `x`, `y`, `radius`.
  - Circle cell: `cell`, `radius`.
  - Optional `limit` (int [1, 100000], default 10000).
- Output: `{ ok, provinces: [{i, name, fullName, color, x, y, distance}], count, area }`.
  - `distance` populated for circle queries, null for rectangle queries.
  - Empty match is still `ok: true`.

## Error modes

- Missing pack / provinces → `not-ready`.
- Out-of-bounds cell → `out-of-bounds`.
- Cell with no coords → `no-cell-point`.
- Both rect+circle params supplied → reject.
- Neither form supplied → reject.
- Incomplete rectangle → reject.
- Non-finite coords → reject.
- Missing / non-finite / negative radius → reject.
- Out-of-range limit → reject.

## Files

1. `src/ai/tools/find-provinces-in-area.ts` — pure scanner + seam + tool.
2. `src/ai/tools/find-provinces-in-area.test.ts` — mirrored test coverage including `defaultFindProvincesInAreaRuntime` integration block.
3. `src/ai/index.ts` — import/re-export/register.
4. `README_AI.md` — add a row below `find_markers_in_area` / near other province finders.

## Verification

- `npm run build` succeeds.
- `npm test` all pass.
- `npm run lint` baseline preserved (7 warnings / 1 info / 0 errors).
