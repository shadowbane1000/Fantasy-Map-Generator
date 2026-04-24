# Plan 249 — `find_religions_in_area`

## Goal

Add a new read-only AI tool `find_religions_in_area` that lists religions whose center cell (`pack.cells.p[religion.center]`) falls inside a rectangular or circular area. Parallel to `find_states_in_area`, `find_provinces_in_area`, `find_burgs_in_area`, `find_markers_in_area`, `find_rivers_in_area`.

## Analogs

- `src/ai/tools/find-states-in-area.ts` — closest template (area forms + limit + seam pattern).
- `src/ai/tools/find-provinces-in-area.ts` — template for pole-less, single-center positioning (religions have no pole, only `center`, unlike states/provinces which have both).
- `src/ai/tools/find-rivers-in-area.ts` — template for cell-centroid-only positioning (rivers use mouth cell, religions use center cell).
- `src/ai/tools/find-states-in-area.test.ts` — mirrored tests.
- `src/ai/tools/list-religions.ts` — religion enumeration pattern.
- `src/ai/tools/get-religion-info.ts` — confirms `religion.center` is a cell index (not an [x, y] pair).
- `src/ai/tools/_shared/pack-types.ts` — `RawReligion` schema (`center?: number`, no pole field).

## Position resolution

Religions have no `pole` — only `center` is a cell index. Per religion (skip `i === 0` 'No religion' and `removed: true`):
1. If `religion.center` is a numeric cell index with a valid `[x, y]` pair at `pack.cells.p[religion.center]` → use it.
2. Else skip.

## Tool shape

- Name: `find_religions_in_area`.
- Inputs (mutually-exclusive rectangle vs. circle):
  - Rectangle: `x1`, `y1`, `x2`, `y2` (finite numbers, normalised).
  - Circle coords: `x`, `y`, `radius`.
  - Circle cell: `cell`, `radius`.
  - Optional `limit` (int [1, 100000], default 10000).
- Output: `{ ok, religions: [{i, name, color, type, form, x, y, distance}], count, area }`.
  - `distance` populated for circle queries (Euclidean pixels), `null` for rectangle queries.
  - Empty match is still `ok: true`.

## Error modes

- Missing pack / `pack.religions` → `not-ready`.
- Out-of-bounds `cell` → `out-of-bounds`.
- Cell with no coords → `no-cell-point`.
- Both rect+circle params supplied → reject.
- Neither form supplied → reject.
- Incomplete rectangle → reject.
- Non-finite coords → reject.
- Missing / non-finite / negative `radius` → reject.
- Out-of-range `limit` → reject.

## Files

1. `src/ai/tools/find-religions-in-area.ts` — pure scanner + seam + tool factory.
2. `src/ai/tools/find-religions-in-area.test.ts` — mirrored test coverage including `defaultFindReligionsInAreaRuntime` integration block.
3. `src/ai/index.ts` — import / re-export / register near `findStatesInAreaTool` (and close to other religion tools).
4. `README_AI.md` — add a row near `find_states_in_area`.

## Verification

- `npm run build` succeeds.
- `npm test` all pass (baseline 4304 → expected ~4340).
- `npm run lint` baseline preserved (7 warnings / 1 info / 0 errors).
