# Plan 212 — `find_cells_by_temperature_range` AI tool

## Goal

Add a read-only AI tool `find_cells_by_temperature_range` that lists every
packed-grid cell index whose temperature (°C, stored per-grid-cell on
`grid.cells.temp[gridI]` and reached via `pack.cells.g[packCellI]`) falls
inside the inclusive range `[min, max]`. Direct analog of the just-merged
`find_cells_by_height_range` — swaps the filter from elevation to
temperature.

## Motivation

Agents that want to act on terrain by climate — drop ice caps onto cold
cells, seed volcano markers in warm bands, audit tundra vs. desert
distribution, pick candidate cells to warm / cool — currently need to
call `get_cell_info` per cell or walk the full cells array manually. A
dedicated bulk temperature scan matches the shape of
`find_cells_by_height_range` / `find_cells_by_biome`, so chain-of-thought
reuse is trivial.

Temperature lives on the **grid** (pre-Voronoi) cells, not the packed
ones. Per `get_cell_info`, the lookup is
`grid.cells.temp[pack.cells.g[packCellI]]`. Values are signed `int8`
degrees Celsius (the app persists them into a typed array), so a
reasonable bound is `[-128, 127]`.

## API

### Input

- `min` (required, integer): minimum temperature °C, inclusive. Integer
  in `[-128, 127]`.
- `max` (required, integer): maximum temperature °C, inclusive. Integer
  in `[-128, 127]`. Must satisfy `min <= max`.
- `limit` (optional, integer): maximum cells to return in the `cells`
  array. Default 10000. Valid range `[1, 100000]`. `count` always reports
  the full unlimited total regardless of truncation.

### Output (happy path)

```json
{
  "ok": true,
  "min": 0,
  "max": 10,
  "cells": [3, 5, 8, ...],
  "count": 1234
}
```

### Errors

- Un-generated map (pack / `pack.cells` / `pack.cells.g` missing, or
  `grid` / `grid.cells` / `grid.cells.temp` missing) → structured
  `not-ready` error.
- Missing or non-integer `min` / `max` → structured validation error.
- `min` or `max` outside `[-128, 127]` → structured validation error.
- `min > max` → structured validation error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-cells-by-temperature-range.ts`

Runtime-seam pattern (parallel to `find-cells-by-height-range.ts`):

1. `findCellsByTemperatureRangeInPack(pack, grid, min, max, limit)` —
   pure collector.
   - Validate `pack` / `pack.cells` / `pack.cells.i` / `pack.cells.g`
     exist, and `grid` / `grid.cells` / `grid.cells.temp` exist; bail
     with `"not-ready"` otherwise.
   - Iterate `pack.cells.i` (or `pack.cells.g.length`); for each pack
     cell resolve `gridI = pack.cells.g[i]`, read `t = grid.cells.temp[gridI]`,
     collect when `t >= min && t <= max`.
   - Return `{ cells, count }`.
2. `FindCellsByTemperatureRangeRuntime` with `find(min, max, limit)`.
3. `defaultFindCellsByTemperatureRangeRuntime` — pulls `pack` and `grid`
   from globals via `getPack` / `getGlobal`.
4. `createFindCellsByTemperatureRangeTool(runtime)` — builds the `Tool`.
   - Rich multi-sentence description explaining inputs, grid.cells.temp
     indirection, outputs, error modes, and typical follow-up actions
     (`add_marker`, `get_cell_info`, `add_burg`).
   - Input schema: `min` + `max` integer in `[-128, 127]`, optional
     `limit`.
   - `execute()` parses inputs, calls runtime, maps `"not-ready"` to
     structured error.
5. Constants: `DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT = 10000`,
   `MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT = 100000`,
   `MIN_TEMPERATURE = -128`, `MAX_TEMPERATURE = 127`.

### Test: `src/ai/tools/find-cells-by-temperature-range.test.ts`

Three describe blocks mirroring `find-cells-by-height-range.test.ts`:

1. **Pure collector** — `findCellsByTemperatureRangeInPack`:
   - Collects cells in a mid-range band.
   - Inclusive boundaries.
   - Single-value range `min === max`.
   - Full `[-128, 127]` range collects every cell.
   - Empty result (no match).
   - Respects `limit`, preserves unlimited `count`.
   - `"not-ready"` when pack / pack.cells / pack.cells.g missing.
   - `"not-ready"` when grid / grid.cells / grid.cells.temp missing.
2. **Tool surface** — `createFindCellsByTemperatureRangeTool(runtime)`:
   - Happy path returns `ok=true` with correct payload.
   - Rejects missing / non-integer / out-of-range `min` / `max`.
   - Rejects `min > max`.
   - Rejects invalid `limit`.
   - Surfaces `not-ready` as structured error.
   - Applies default limit when omitted.
   - Verifies exported tool name + schema shape.
   - Exposes constants.
3. **defaultFindCellsByTemperatureRangeRuntime (integration)** — stubs
   `globalThis.pack` and `globalThis.grid`, asserts default runtime
   wires through correctly. Uses `as unknown as { pack?: unknown; grid?: unknown }`
   casts.

### Registration & README

- Register `findCellsByTemperatureRangeTool` in `src/ai/index.ts` near
  `findCellsByHeightRangeTool`.
- Add export block for the tool's public API.
- Add README_AI.md row near `find_cells_by_height_range`, ending with
  "Requires an Anthropic API key (see 'Getting an API key' below)".

## Risks

- None — read-only, pure scan, no side effects.
- Collision: verified against `src/ai/tools/*` — no existing tool
  filters cells by temperature.
