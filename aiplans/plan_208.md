# Plan 208 — `find_cells_by_biome` AI tool

## Goal

Add a read-only AI tool `find_cells_by_biome` that lists every packed-grid cell
index currently assigned to a given biome. This is the biome parallel of
`get_entity_cells` (which handles state / province / culture / religion), and
a bulk counterpart to `get_biome_info` (which only returns the count, not the
cell ids).

## Motivation

Agents that want to act on every cell of a biome — flatten a mountain range,
re-texture a desert, audit matched burgs, or find candidate cells for
`add_burg` / `add_marker` — currently have no way to enumerate the member
cells. `get_biome_info` gives a count and scalars; `list_biomes` does not
return cell ids; `get_entity_cells` does not accept biomes. The closest
workaround is `find_cells_in_radius` or iterating every cell via repeated
`get_cell_info` calls, both of which are lossy or quota-burning.

A dedicated biome-keyed lookup closes this gap with a clean, minimal API that
mirrors the `get_entity_cells` shape for easy reuse in chain-of-thought
sequences.

## API

### Input

- `biome` (required): non-negative integer id (0 = Marine allowed, mirroring
  `get_biome_info` / `rename_biome`) OR case-insensitive current biome name
  (resolved via the shared `findBiomeByRef` — biomes whose name slot is the
  sentinel `"removed"` are skipped).
- `limit` (optional, integer): maximum cells to return in the `cells`
  array. Default 10000. Valid range `[1, 100000]`. `count` always reports
  the full unlimited total regardless of truncation.

### Output (happy path)

```json
{
  "ok": true,
  "biome": { "i": 5, "name": "Temperate deciduous forest" },
  "cells": [12, 34, 56, ...],
  "count": 1234
}
```

### Errors

- Un-generated map (pack or `pack.cells.biome` missing) → `not-ready`
- Unresolvable biome ref (invalid id, unknown name, retired slot) →
  `not-found`
- `biome` missing / wrong type / negative id / empty string → structured
  validation error
- `limit` out of range / non-integer → structured validation error

## Implementation

### File: `src/ai/tools/find-cells-by-biome.ts`

Runtime-seam pattern (parallel to `get-entity-cells.ts` and
`get-biome-info.ts`):

1. `findBiomeCellsInPack(biomesData, pack, ref, limit)` — pure collector.
   - Validate inputs; bail with `"not-ready"` if biomesData / pack / cells /
     biome field missing.
   - Resolve ref via `findBiomeByRef` from `./rename-biome`. Return
     `"not-found"` if no match.
   - Iterate `pack.cells.biome`; collect indices where `value === biomeI`.
     Cap `cells` at `limit`, but always increment `count` for every match.
   - Return `{ i, name, cells, count }`.
2. `FindCellsByBiomeRuntime` interface with `collect(ref, limit)` method.
3. `defaultFindCellsByBiomeRuntime` — pulls `biomesData` and `pack` from
   globals.
4. `createFindCellsByBiomeTool(runtime)` — builds the `Tool` object.
   - Rich multi-sentence description explaining inputs, outputs, error modes,
     and typical follow-up actions (`add_burg`, `add_marker`, `set_cell_height`).
   - Input schema exposes `biome` + optional `limit` (with `minimum`/`maximum`).
   - `execute()` parses inputs, calls runtime, maps `"not-ready"` /
     `"not-found"` to structured errors.
5. Constants: `DEFAULT_FIND_CELLS_BY_BIOME_LIMIT = 10000`,
   `MAX_FIND_CELLS_BY_BIOME_LIMIT = 100000`.

### Test: `src/ai/tools/find-cells-by-biome.test.ts`

Three describe blocks mirroring `get-entity-cells.test.ts`:

1. **Pure collector** — `findBiomeCellsInPack`:
   - Collects by numeric id.
   - Collects by case-insensitive name.
   - Empty result when no cell matches.
   - Respects `limit`, preserves unlimited `count`.
   - Returns `"not-found"` for unknown / removed refs.
   - Returns `"not-ready"` when biomesData / pack / cells / biome missing.
2. **Tool surface** — `createFindCellsByBiomeTool(runtime)`:
   - Happy path returns `ok=true` with correct payload.
   - Rejects missing / invalid `biome`.
   - Rejects out-of-range `limit`.
   - Surfaces `not-ready` / `not-found` as structured errors.
   - Verifies exported `findCellsByBiomeTool` name + schema shape.
3. **defaultFindCellsByBiomeRuntime (integration)** — stubs
   `globalThis.biomesData` and `globalThis.pack`, asserts default runtime
   wires through correctly. Uses `as unknown as { biomesData?; pack?; }`
   casts.

### Registration & README

- Register `findCellsByBiomeTool` in `src/ai/index.ts` near
  `getEntityCellsTool`.
- Add export block for the tool's public API (constants, types, factory,
  default runtime).
- Add README_AI.md row near `get_entity_cells` with "Requires an Anthropic API
  key (see 'Getting an API key' below)" boilerplate + sample prompts.

## Risks

- None — read-only, pure scan of `pack.cells.biome`, no side effects.
- Collision: a separate tool elsewhere might already scan by biome. Verified
  against `src/ai/tools/*` — no existing tool enumerates cells by biome.
