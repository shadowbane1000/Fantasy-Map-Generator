# Plan 214 — `find_cells_by_population_range` AI tool

## Goal

Add a read-only AI tool `find_cells_by_population_range` that lists every
packed-grid cell index whose rural population (`pack.cells.pop[i]`) falls inside
the inclusive range `[min, max]`. This is the population parallel of
`find_cells_by_height_range` (height), `find_cells_by_temperature_range`
(temperature), and `find_cells_by_precipitation_range` (moisture).

## Motivation

Agents that want to act on cells by population density — flag empty wilderness,
audit densely populated hinterland, seed burgs near populated cells, target
cell-level redistribution — currently need to call `get_cell_info` per cell,
which is slow and noisy. A dedicated bulk population scan gives them a terse,
predictable API with a known upper bound. Mirrors `find_cells_by_height_range`
response shape so chain-of-thought reuse is trivial.

Unlike `prec` and `temp` (which live on `grid.cells`), **rural population lives
directly on `pack.cells.pop`** — a `Float32Array` sized `pack.cells.i.length`.
No grid indirection is needed, so the collector is structurally identical to
`find_cells_by_height_range`: single array, single lookup.

**The raw `pack.cells.pop[i]` value is the pre-scale population** — it is
multiplied by `populationRate` (from `options`) to obtain an actual inhabitant
count. The tool accepts and returns **raw** pre-scale values; the description
must call this out explicitly.

Typical raw values are fractional (e.g. `0`, `0.15`, `3.8`, `42.6`), with `0`
meaning "no rural population" (water, uninhabitable, or simply empty land).
The range accepts any finite non-negative numbers.

## API

### Input

- `min` (required, number): minimum raw pre-scale population, inclusive. Finite,
  `>= 0`. Fractional values allowed.
- `max` (required, number): maximum raw pre-scale population, inclusive. Finite,
  `>= 0`. Must satisfy `min <= max`.
- `limit` (optional, integer): maximum cells to return in the `cells` array.
  Default 10000. Valid range `[1, 100000]`. `count` always reports the full
  unlimited total regardless of truncation.

### Output (happy path)

```json
{
  "ok": true,
  "min": 0,
  "max": 5,
  "cells": [3, 5, 8, ...],
  "count": 1234
}
```

### Errors

- Un-generated map (pack / `pack.cells` / `pack.cells.pop` missing) →
  structured `not-ready` error.
- Missing or non-finite `min` / `max` → structured validation error.
- `min` or `max` negative → structured validation error.
- `min > max` → structured validation error.
- `limit` out of range / non-integer → structured validation error.

## Implementation

### File: `src/ai/tools/find-cells-by-population-range.ts`

Runtime-seam pattern (parallel to `find-cells-by-height-range.ts`):

1. `findCellsByPopulationRangeInPack(pack, min, max, limit)` — pure collector.
   - Validate `pack.cells.pop` exists with numeric `length`; bail with
     `"not-ready"` otherwise.
   - Iterate `pack.cells.pop`; when `pop >= min && pop <= max`, increment
     `count` and push `i` into `cells` (capped by `limit`).
   - Return `{ cells, count }`.
2. `FindCellsByPopulationRangeRuntime` with `find(min, max, limit)` method.
3. `defaultFindCellsByPopulationRangeRuntime` — pulls `pack` from globals via
   `getPack`.
4. `createFindCellsByPopulationRangeTool(runtime)` — builds the `Tool` object.
   - Rich multi-sentence description explaining inputs, outputs, error modes,
     typical follow-up actions (`get_cell_info`, `add_burg`, `add_marker`), and
     the **pre-scale** caveat about `pop` values.
   - Input schema exposes `min` + `max` (number, `minimum: 0`) + optional
     `limit` (integer).
   - `execute()` parses inputs, calls runtime, maps `"not-ready"` to structured
     error.
5. Constants:
   - `DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT = 10000`
   - `MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT = 100000`
   - `MIN_POPULATION = 0` (lower bound for input validation).

### Test: `src/ai/tools/find-cells-by-population-range.test.ts`

Three describe blocks mirroring `find-cells-by-height-range.test.ts`:

1. **Pure collector** — `findCellsByPopulationRangeInPack`:
   - Collects cells in a mid-range band.
   - Inclusive boundaries.
   - Single-value range `min === max` (e.g. 0, for empty cells).
   - Zero-population (empty wilderness) range returns all cells with `pop == 0`.
   - Empty result → `count = 0`, `cells = []`.
   - Respects `limit`, preserves unlimited `count`.
   - Returns `"not-ready"` when pack, `pack.cells`, or `pack.cells.pop`
     missing.
2. **Tool surface** — `createFindCellsByPopulationRangeTool(runtime)`:
   - Happy path returns `ok=true` with correct payload.
   - Fractional min / max accepted (e.g. `{min: 0.5, max: 4.5}`).
   - Rejects missing / non-number / negative `min` / `max`.
   - Rejects `min > max`.
   - Rejects invalid `limit`.
   - Surfaces `not-ready` as structured error.
   - Applies default limit when omitted.
   - Verifies exported `findCellsByPopulationRangeTool` name + schema.
   - Exposes constants.
3. **defaultFindCellsByPopulationRangeRuntime (integration)** — stubs
   `globalThis.pack`, asserts default runtime wires through correctly. Uses
   `as unknown as { pack?: unknown }` casts.

### Registration & README

- Register `findCellsByPopulationRangeTool` in `src/ai/index.ts` near
  `findCellsByPrecipitationRangeTool`.
- Add export block for the tool's public API (constants, types, factory,
  default runtime).
- Add README_AI.md row near `find_cells_by_precipitation_range` with
  "Requires an Anthropic API key (see 'Getting an API key' below)"
  boilerplate + sample prompts.

## Risks

- None — read-only, pure scan of `pack.cells.pop`, no side effects.
- Collision: verified against `src/ai/tools/*` — no existing tool enumerates
  cells by population.
- Pre-scale value confusion is the only surface concern — mitigated by
  explicit mention in the description that these are raw pre-scale numbers,
  not inhabitant counts.
