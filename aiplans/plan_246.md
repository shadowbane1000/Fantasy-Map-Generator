# Plan 246 — `find_states_in_area`

## Goal

Add a new read-only AI tool `find_states_in_area` that lists states whose position (pole preferred, else `pack.cells.p[state.center]`) falls inside a rectangular or circular area. Parallel to `find_provinces_in_area`, `find_burgs_in_area`, `find_markers_in_area`, `find_rivers_in_area`.

## Analogs

- `src/ai/tools/find-provinces-in-area.ts` — direct template (pole + center fallback).
- `src/ai/tools/find-provinces-in-area.test.ts` — mirrored tests.
- `src/ai/tools/find-burgs-in-area.ts` — area-geometry template.
- `src/ai/tools/list-states.ts` — state summary shape, `capital` field via `pack.burgs`.
- `src/ai/tools/_shared/pack-types.ts` — `RawState` schema (pole, center, capital, form, color, fullName).

## Position resolution

Per state (skip `i === 0` Neutrals and `removed: true`):
1. If `state.pole` is a valid `[x, y]` pair of numbers → use it.
2. Else if `state.center` is a valid cell index → read `pack.cells.p[state.center]`.
3. Else skip.

## Tool shape

- Name: `find_states_in_area`.
- Inputs (mutually-exclusive rectangle vs. circle):
  - Rectangle: `x1`, `y1`, `x2`, `y2` (finite numbers, normalised).
  - Circle coords: `x`, `y`, `radius`.
  - Circle cell: `cell`, `radius`.
  - Optional `limit` (int [1, 100000], default 10000).
- Output: `{ ok, states: [{i, name, fullName, color, form, capital, x, y, distance}], count, area }`.
  - `capital` resolved to burg name via `pack.burgs[state.capital]` (string or `null`).
  - `distance` populated for circle queries, null for rectangle queries.
  - Empty match is still `ok: true`.

## Error modes

- Missing pack / `pack.states` → `not-ready`.
- Out-of-bounds `cell` → `out-of-bounds`.
- Cell with no coords → `no-cell-point`.
- Both rect+circle params supplied → reject.
- Neither form supplied → reject.
- Incomplete rectangle → reject.
- Non-finite coords → reject.
- Missing / non-finite / negative `radius` → reject.
- Out-of-range `limit` → reject.

## Files

1. `src/ai/tools/find-states-in-area.ts` — pure scanner + seam + tool factory.
2. `src/ai/tools/find-states-in-area.test.ts` — mirrored test coverage including `defaultFindStatesInAreaRuntime` integration block.
3. `src/ai/index.ts` — import / re-export / register near `findProvincesInAreaTool`.
4. `README_AI.md` — add a row near `find_provinces_in_area`.

## Verification

- `npm run build` succeeds.
- `npm test` all pass (baseline 4243 → expected ~4268).
- `npm run lint` baseline preserved (7 warnings / 1 info / 0 errors).
