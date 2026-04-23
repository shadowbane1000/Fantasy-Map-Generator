# Plan 211 — `find_cells_by_height_range` AI tool

## Goal

Add a read-only AI tool `find_cells_by_height_range` that lists every
packed-grid cell index whose `pack.cells.h` value falls inside the inclusive
range `[min, max]`. This is the height parallel of `find_cells_by_biome` /
`get_entity_cells` and closes the gap between `get_cell_info` (per-cell) and
`find_cells_in_radius` (spatial).

## Motivation

Agents that want to act on terrain by elevation — flatten lowlands, audit
highlands, carve coastal cells (h in [18, 25]), drop oceans to sea level,
or pick candidate cells for peaks — currently need to repeatedly call
`get_cell_info` or iterate every cell. A dedicated bulk height scan gives
them a terse, predictable API with a known upper bound. Mirrors
`find_cells_by_biome` / `find_cells_in_radius` response shape so chain-of-
thought reuse is trivial.

Heights in this codebase are integers in `[0, 100]`:
- `0-19` water (deep to shallow sea)
- `20` shore / sea level (`ELEVATION_NEUTRAL_HEIGHT`)
- `20-100` land (coast → hills → mountains → peaks)

## API

### Input

- `min` (required, integer): minimum height, inclusive. Integer in `[0, 100]`.
- `max` (required, integer): maximum height, inclusive. Integer in `[0, 100]`.
  Must satisfy `min <= max`.
- `limit` (optional, integer): maximum cells to return in the `cells`
  array. Default 10000. Valid range `[1, 100000]`. `count` always reports
  the full unlimited total regardless of truncation.

### Output (happy path)

```json
{
  "ok": true,
  "min": 20,
  "max": 40,
  "cells": [3, 5, 8, ...],
  "count": 1234
}
```

### Errors

- Un-generated map (pack / `pack.cells` / `pack.cells.h` missing) →
  structured `not-ready` error.
- Missing or non-integer `min` / `max` → structured validation error.
- `min` or `max` outside `[0, 100]` → structured validation error.
- `min > max` → structured validation error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-cells-by-height-range.ts`

Runtime-seam pattern (parallel to `find-cells-by-biome.ts` /
`find-cells-in-radius.ts`):

1. `findCellsByHeightRangeInPack(pack, min, max, limit)` — pure collector.
   - Validate `pack` / `pack.cells` / `pack.cells.h` exist with a numeric
     `length`; bail with `"not-ready"` otherwise.
   - Iterate `pack.cells.h`; when `h >= min && h <= max`, increment `count`
     and push `i` into `cells` (capped by `limit`).
   - Return `{ cells, count }`.
2. `FindCellsByHeightRangeRuntime` with `find(min, max, limit)` method.
3. `defaultFindCellsByHeightRangeRuntime` — pulls `pack` from globals.
4. `createFindCellsByHeightRangeTool(runtime)` — builds the `Tool` object.
   - Rich multi-sentence description explaining inputs, outputs, error modes,
     and typical follow-up actions (`set_cell_height`, `get_cell_info`,
     `add_burg`, `add_marker`).
   - Input schema exposes `min` + `max` (integer, `minimum: 0`,
     `maximum: 100`) + optional `limit`.
   - `execute()` parses inputs, calls runtime, maps `"not-ready"` to
     structured error.
5. Constants: `DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT = 10000`,
   `MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT = 100000`,
   `MIN_HEIGHT = 0`, `MAX_HEIGHT = 100`.

### Test: `src/ai/tools/find-cells-by-height-range.test.ts`

Three describe blocks mirroring `find-cells-by-biome.test.ts`:

1. **Pure collector** — `findCellsByHeightRangeInPack`:
   - Collects cells in a mid-range band.
   - Inclusive boundaries (cells where `h === min` and `h === max` are both
     included).
   - Single-value range `min === max` returns exactly those cells.
   - Full `[0, 100]` range collects every cell.
   - Empty result (range matches nothing) → `count = 0`, `cells = []`.
   - Respects `limit`, preserves unlimited `count`.
   - Returns `"not-ready"` when pack / cells / h missing.
2. **Tool surface** — `createFindCellsByHeightRangeTool(runtime)`:
   - Happy path returns `ok=true` with correct payload.
   - Rejects missing / non-integer / out-of-range `min` / `max`.
   - Rejects `min > max`.
   - Rejects invalid `limit`.
   - Surfaces `not-ready` as structured error.
   - Applies default limit when omitted.
   - Verifies exported `findCellsByHeightRangeTool` name + schema shape.
   - Exposes constants.
3. **defaultFindCellsByHeightRangeRuntime (integration)** — stubs
   `globalThis.pack`, asserts default runtime wires through correctly.
   Uses `as unknown as { pack?: unknown }` casts.

### Registration & README

- Register `findCellsByHeightRangeTool` in `src/ai/index.ts` near
  `findCellsByBiomeTool`.
- Add export block for the tool's public API (constants, types, factory,
  default runtime).
- Add README_AI.md row near `find_cells_by_biome` with "Requires an
  Anthropic API key (see 'Getting an API key' below)" boilerplate + sample
  prompts.

## Risks

- None — read-only, pure scan of `pack.cells.h`, no side effects.
- Collision: verified against `src/ai/tools/*` — no existing tool
  enumerates cells by height.
