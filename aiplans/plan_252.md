# Plan 252 — `find_highest_peaks`

## Goal

Add a new AI tool `find_highest_peaks` that returns the top N land cells ranked by height descending. This is the elevation ranking parallel to:

- `find_largest_burgs` — top-N burgs by population
- `find_longest_rivers` — top-N rivers by length

It complements the filter-style `find_cells_by_height_range` (inclusive `[min, max]` band) by answering the prompt "where are the highest peaks?" without requiring the caller to pick a threshold.

## Shape

- Input: `{ n?: integer }`, `n` defaults to `10`, valid in `[1, 500]`.
- Output: `{ ok, peaks: [{ cell, height, x, y }], count, requested_n }`.
- Only includes land cells (`h >= 20` — `ELEVATION_NEUTRAL_HEIGHT` is the shore value; sub-20 is water).
- Reads `pack.cells.h` (Uint8 per-cell height) and `pack.cells.p` (array of `[x, y]` tuples) via the default runtime.
- Read-only; does not mutate or redraw.

## Algorithm

1. Get `pack.cells.h` and `pack.cells.p`. Either missing → `"not-ready"`.
2. Iterate `i` from 0 to `h.length - 1`. Collect `{ cell: i, height, x, y }` whenever `h[i] >= 20`. `x` / `y` fall back to 0 if the coordinate pair is missing / non-numeric.
3. Sort by `height` descending (stable sort keeps tie order deterministic via cell index).
4. Slice the top `n`.
5. Return `{ peaks, count: peaks.length, requested_n: n }`. `count` is the slice length (≤ `n`), not a pre-slice total — matches `find_largest_burgs` / `find_longest_rivers` semantics.

## Files

- `src/ai/tools/find-highest-peaks.ts` — implementation using the runtime-seam pattern.
- `src/ai/tools/find-highest-peaks.test.ts` — unit + tool-surface + default-runtime integration tests.
- `src/ai/index.ts` — import, export, register the tool (near other `findCells…` / `findLargest…` / `findLongest…` neighbours).
- `README_AI.md` — add a row near `find_cells_by_height_range` describing the tool and example prompts.

## Non-goals

- No biome / state / feature filter — we want the simplest analog of `find_largest_burgs`.
- No `limit` alias — parameter is `n` like the other top-N tools.
- No water cells — caller can use `find_cells_by_height_range` with `{min: 0, max: 19}` for deep water.
