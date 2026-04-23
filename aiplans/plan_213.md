# Plan 213 — `find_cells_by_precipitation_range` AI tool

## Goal

Add a read-only AI tool `find_cells_by_precipitation_range` that lists every
packed-grid cell index whose precipitation falls inside the inclusive range
`[min, max]`. This is the precipitation parallel of `find_cells_by_height_range`
(height) and `find_cells_by_biome` (biome).

## Motivation

Agents that want to act on cells by moisture / rainfall — flag deserts, audit
rainforests, seed rivers in wet zones, pick candidate cells for biome
reshuffling — currently need to call `get_cell_info` per cell, which is slow
and noisy. A dedicated bulk precipitation scan gives them a terse, predictable
API with a known upper bound. Mirrors `find_cells_by_height_range` response
shape so chain-of-thought reuse is trivial.

Precipitation in this codebase lives on **`grid.cells.prec`** (the pre-Voronoi
base grid), not directly on `pack.cells`. The pack-to-grid mapping is
`pack.cells.g[packCellI] → gridCellI`, so the scan must resolve each pack
cell's grid cell before reading precipitation. See `get_cell_info.ts` for the
canonical resolution pattern.

Precipitation values are `Uint8` integers in `[0, 255]` — stored as an 8-bit
typed array in the save file (see `save.js` / `load.js` — `s16` / `cells.prec`
is packed as Uint8).

## API

### Input

- `min` (required, integer): minimum precipitation, inclusive. Integer in
  `[0, 255]`.
- `max` (required, integer): maximum precipitation, inclusive. Integer in
  `[0, 255]`. Must satisfy `min <= max`.
- `limit` (optional, integer): maximum cells to return in the `cells` array.
  Default 10000. Valid range `[1, 100000]`. `count` always reports the full
  unlimited total regardless of truncation.

### Output (happy path)

```json
{
  "ok": true,
  "min": 20,
  "max": 80,
  "cells": [3, 5, 8, ...],
  "count": 1234
}
```

### Errors

- Un-generated map (pack / `pack.cells` / `pack.cells.g` missing, or
  `grid` / `grid.cells` / `grid.cells.prec` missing) → structured
  `not-ready` error.
- Missing or non-integer `min` / `max` → structured validation error.
- `min` or `max` outside `[0, 255]` → structured validation error.
- `min > max` → structured validation error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-cells-by-precipitation-range.ts`

Runtime-seam pattern (parallel to `find-cells-by-height-range.ts`):

1. `findCellsByPrecipitationRangeInPack(pack, grid, min, max, limit)` — pure
   collector.
   - Validate `pack.cells.g` and `grid.cells.prec` both exist with numeric
     `length`; bail with `"not-ready"` otherwise.
   - Iterate `pack.cells.g`; resolve `gridCellI = g[i]`, read
     `prec[gridCellI]`; when `prec >= min && prec <= max`, increment
     `count` and push `i` into `cells` (capped by `limit`).
   - Return `{ cells, count }`.
2. `FindCellsByPrecipitationRangeRuntime` with `find(min, max, limit)`
   method.
3. `defaultFindCellsByPrecipitationRangeRuntime` — pulls `pack` and `grid`
   from globals via `getPack` + `getGlobal`.
4. `createFindCellsByPrecipitationRangeTool(runtime)` — builds the `Tool`
   object.
   - Rich multi-sentence description explaining inputs, outputs, error
     modes, and typical follow-up actions (`set_cell_height`,
     `get_cell_info`, `add_burg`, `add_marker`, biome review).
   - Input schema exposes `min` + `max` (integer, `minimum: 0`,
     `maximum: 255`) + optional `limit`.
   - `execute()` parses inputs, calls runtime, maps `"not-ready"` to
     structured error.
5. Constants: `DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT = 10000`,
   `MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT = 100000`,
   `MIN_PRECIPITATION = 0`, `MAX_PRECIPITATION = 255`.

### Test: `src/ai/tools/find-cells-by-precipitation-range.test.ts`

Three describe blocks mirroring `find-cells-by-height-range.test.ts`:

1. **Pure collector** — `findCellsByPrecipitationRangeInPack`:
   - Collects cells in a mid-range band.
   - Inclusive boundaries.
   - Single-value range `min === max` returns exactly those cells.
   - Full `[0, 255]` range collects every cell.
   - Empty result → `count = 0`, `cells = []`.
   - Respects `limit`, preserves unlimited `count`.
   - Returns `"not-ready"` when pack, grid, or relevant arrays missing.
2. **Tool surface** — `createFindCellsByPrecipitationRangeTool(runtime)`:
   - Happy path returns `ok=true` with correct payload.
   - Rejects missing / non-integer / out-of-range `min` / `max`.
   - Rejects `min > max`.
   - Rejects invalid `limit`.
   - Surfaces `not-ready` as structured error.
   - Applies default limit when omitted.
   - Verifies exported `findCellsByPrecipitationRangeTool` name + schema.
   - Exposes constants.
3. **defaultFindCellsByPrecipitationRangeRuntime (integration)** — stubs
   `globalThis.pack` AND `globalThis.grid`, asserts default runtime wires
   through correctly. Uses `as unknown as { pack?: unknown; grid?: unknown }`
   casts.

### Registration & README

- Register `findCellsByPrecipitationRangeTool` in `src/ai/index.ts` near
  `findCellsByHeightRangeTool`.
- Add export block for the tool's public API (constants, types, factory,
  default runtime).
- Add README_AI.md row near `find_cells_by_height_range` with "Requires an
  Anthropic API key (see 'Getting an API key' below)" boilerplate + sample
  prompts.

## Risks

- None — read-only, pure scan of `pack.cells.g` + `grid.cells.prec`, no
  side effects.
- Collision: verified against `src/ai/tools/*` — no existing tool
  enumerates cells by precipitation.
- Two-global dependency (pack + grid) is slightly more fragile than the
  pure-pack scans — covered by explicit `"not-ready"` cases in tests.
