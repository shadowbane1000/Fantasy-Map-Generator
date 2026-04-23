# Plan 195 — add `find_cells_in_radius` AI tool

## Goal
Add a read-only AI tool that returns every packed-grid cell whose
centroid is within a given radius of a center point (either an
`(x, y)` coordinate pair or a `cell` id). Parallels
`find_cell_at_coords` (single closest cell) and
`find_nearest_burg` (cell / coords duality).

## Why
`find_cell_at_coords` only returns the single nearest cell and
`get_entity_cells` only returns cells assigned to a specific state /
province / culture / religion. Agents that want to reason about an
arbitrary region — e.g. "flatten everything within 100 px of this
point", "list every cell inside this circle", "count cells around a
marker" — have no direct way to collect them. This gives them the
radius primitive.

## Shape

Tool name: `find_cells_in_radius`

Input (exactly one of `(x, y)` or `cell`, plus `radius`):
- `x` (number) — x coordinate of center point. Paired with `y`.
  Mutually exclusive with `cell`.
- `y` (number) — y coordinate of center point. Paired with `x`.
  Mutually exclusive with `cell`.
- `cell` (integer, >= 0) — packed cell index whose centroid
  (`pack.cells.p[cell]`) is used as the center. Mutually exclusive
  with `x` / `y`.
- `radius` (number, required) — search radius in SVG pixels. Must be
  a finite number >= 0. When `0`, returns only cells whose centroid
  is exactly at the center (typically an empty list).
- `limit` (integer, optional, default 10000, max 100000) — caps the
  returned `cells` array. `count` always reports the full unlimited
  total.

Behavior:
- Read-only.
- Validate input.
- Validate that `pack.cells.p` / `pack.cells.i` is loaded
  (`not-ready`).
- Resolve the center point (from `cell` via `pack.cells.p[cell]` or
  from `x` / `y`).
- Iterate `pack.cells.p` and collect every cell index whose squared
  Euclidean distance to the center is `<= radius * radius`. (Pure
  scan — keeps the tool testable and independent of the d3-quadtree
  that `window.findAll` wraps.)
- Truncate to `limit` but still report full `count`.
- Return `{ ok, cells, count, center: { x, y } }`.

## Files

- `src/ai/tools/find-cells-in-radius.ts` — runtime-seam tool.
- `src/ai/tools/find-cells-in-radius.test.ts` — pure / seam tests
  plus `defaultFindCellsInRadiusRuntime` integration block (sets
  `globalThis.pack`).
- `src/ai/index.ts` — import, register, re-export.
- `README_AI.md` — add row near `find_cell_at_coords`.

## Architecture

Mirror `find-nearest-burg.ts` (cell-or-coords duality) combined with
`get-entity-cells.ts` (list-with-limit shape):

- `export interface FindCellsInRadiusHit { cells: number[]; count: number; center: { x: number; y: number } }`
- `export type FindCellsInRadiusQuery =
     | { kind: "coords"; x: number; y: number; radius: number; limit: number }
     | { kind: "cell"; cell: number; radius: number; limit: number }`
- `export type FindCellsInRadiusResult =
     | FindCellsInRadiusHit
     | "not-ready"
     | "out-of-bounds"
     | "no-cell-point"`
- `export function findCellsInRadiusInPack(pack, query): FindCellsInRadiusResult`
- `export interface FindCellsInRadiusRuntime { find(query): FindCellsInRadiusResult }`
- `export const defaultFindCellsInRadiusRuntime` — reads from
  `getPack()` via `_shared/globals.ts`.
- `export function createFindCellsInRadiusTool(runtime = default): Tool`
- `export const findCellsInRadiusTool = createFindCellsInRadiusTool()`

Input schema (no `required[]` — oneOf logic is runtime):
```
{
  x: number,
  y: number,
  cell: integer (minimum 0),
  radius: number (minimum 0, required at runtime),
  limit: integer (minimum 1, maximum 100000)
}
```

Scan loop: squared-distance comparison (avoid `Math.sqrt` per cell).

## Validation / edge cases

- `pack` / `pack.cells.p` missing → `"not-ready"`.
- Neither `(x, y)` nor `cell` supplied → input error.
- Both `(x, y)` and `cell` supplied → input error.
- Partial coords (only `x` or only `y`) → input error.
- Non-finite `x` / `y` → input error.
- `cell` not a non-negative integer → input error.
- `cell` out of bounds (`>= pack.cells.i.length`) → `"out-of-bounds"`.
- `cell` with no coordinates in `pack.cells.p` → `"no-cell-point"`.
- `radius` missing / non-finite / negative → input error.
- `radius === 0` → valid (possibly empty result).
- `limit` not an integer in `[1, 100000]` → input error.
- Empty result (no cells in radius) → returns
  `{ cells: [], count: 0, center }`, not an error.

## Tests

Pure / seam:
- coordinate query returns all cells in radius sorted by index order.
- cell query resolves `pack.cells.p[cell]` then scans.
- radius 0 returns the single cell exactly at center (if any) or empty.
- `limit` truncates the `cells` array but `count` stays full.
- honors squared-distance (boundary cell exactly on radius included).
- empty pack (`cells.p` empty) returns `{ cells: [], count: 0, center }`.
- `"not-ready"` when pack / cells.p missing.
- `"out-of-bounds"` when cell >= cells.i.length.
- `"no-cell-point"` when cells.p[cell] is undefined.

Tool surface:
- rejects both / neither form of input.
- rejects non-finite `x` / `y`.
- rejects non-integer / negative `cell`.
- rejects missing / negative / non-finite `radius`.
- rejects out-of-range `limit`.
- accepts `radius: 0`.
- surfaces `"not-ready"` / `"out-of-bounds"` / `"no-cell-point"` as
  structured errors.
- happy path returns `{ ok: true, cells: [...], count: N, center: { x, y } }`.
- `findCellsInRadiusTool` exported with expected schema and
  no required[] (oneOf-style logic done at runtime).

Integration (`defaultFindCellsInRadiusRuntime`):
- with `globalThis.pack` seeded, reads a real pack for coord query.
- cell-form query via default runtime resolves center through pack.
- returns `"not-ready"` through the tool when pack is missing.

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite count.

## Out of scope

- Using `window.findAll` / d3-quadtree for performance: the pure scan
  is easy to unit-test and the result set is naturally bounded by
  `limit`. A future optimization can swap the runtime to delegate to
  the quadtree without changing the tool's public shape.
- Sorting by distance (callers can do it themselves or pair with
  `get_cell_info` — cheap given `pack.cells.p[cell]`).
- Polygon / rectangle queries (distinct tools).
- Cell filters (biome, state, height, etc.) — compose with other
  tools / `get_entity_cells`.
