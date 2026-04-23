# Plan 179 — `find_nearest_burg` AI tool

## Goal
Add a read-only AI tool that, given either coordinates `(x, y)` or a packed
cell id, finds the nearest non-removed burg on the current map and returns its
identity, coordinates, and Euclidean distance. Useful for the AI to anchor
reasoning about "the city nearest to this region / point of interest".

## Use case
Given a query point (from either `x` + `y` inputs or `cell` → `pack.cells.p[cell]`),
scan `pack.burgs`, skip index-0 placeholder and `removed` entries, and return
the burg with the minimum Euclidean distance from the query point.

## Shape
- **Tool name**: `find_nearest_burg`
- **Inputs** (exactly one of the two forms):
  - Coordinate form:
    - `x` (number, required with `y`) — horizontal coordinate in map (SVG) space.
    - `y` (number, required with `x`) — vertical coordinate in map (SVG) space.
  - Cell form:
    - `cell` (integer, required alone) — packed cell index. Uses `pack.cells.p[cell]`
      as the query point.
- **Output** (on success, burg found):
  ```
  {
    ok: true,
    i: <int>,
    name: <string>,
    x: <number>,
    y: <number>,
    distance: <number>   // Euclidean distance from the query point
  }
  ```
- **Output** (map has no active burgs):
  ```
  { ok: true, i: null, name: null, x: null, y: null, distance: null }
  ```
- **Errors**:
  - map not ready (no `pack`) → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - neither `x/y` nor `cell` provided → `Provide either (x, y) coordinates or a cell id.`
  - both provided → `Provide either (x, y) or cell, not both.`
  - `x` or `y` not finite number → `x and y must be finite numbers.`
  - `cell` not non-negative integer → `cell must be a non-negative integer.`
  - `cell` out of bounds (>= pack.cells.i.length) → `cell <n> is out of bounds.`
  - `cell` has no point in `pack.cells.p[cell]` → `cell <n> has no coordinates.`

## Runtime seam
```ts
export interface FindNearestBurgRuntime {
  findNearest(query: { x: number; y: number } | { cell: number }): FindNearestResult;
}
export const defaultFindNearestBurgRuntime: FindNearestBurgRuntime = {
  findNearest(query) { /* reads globalThis.pack */ }
};
```

Internally a helper `findNearestBurgInPack(pack, query)` does the pure work
so tests invoke it without touching globals. Its return type is a discriminated
union:
- `"not-ready"` when pack / burgs / cells missing.
- `"out-of-bounds"` when a cell query is past `pack.cells.i.length`.
- `"no-cell-point"` when `pack.cells.p[cell]` is undefined.
- `{ i, name, x, y, distance } | { i: null, ... }` on success.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Coordinate query returns the closest of several active burgs.
2. Cell query resolves `pack.cells.p[cell]` then returns closest burg.
3. Skips `i === 0` placeholder burg even when it has coordinates.
4. Skips `removed: true` burgs.
5. Breaks ties deterministically (returns first by iteration order).
6. Distance is the Euclidean distance from the query point to the winning
   burg.
7. Returns `{ ok: true, i: null, ... }` when no active burgs exist.
8. Returns `not-ready` when `pack.burgs` is missing.
9. Returns `out-of-bounds` on cell past `cells.i.length`.
10. Returns `no-cell-point` when `cells.p[cell]` is undefined.
11. Tool: rejects when neither `x/y` nor `cell` provided.
12. Tool: rejects when both `x/y` and `cell` are provided.
13. Tool: rejects non-finite `x` / `y`.
14. Tool: rejects non-integer / negative `cell`.
15. Tool: surfaces `not-ready` / `out-of-bounds` / `no-cell-point` sentinels
    as errors.
16. Schema sanity: tool name is `find_nearest_burg`; no `required` (oneOf form).

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: ... })` writes + `afterEach` restores,
mirroring `get-cell-info.test.ts`:
1. Reads real pack via default runtime for a coordinate query.
2. Reads real pack via default runtime for a cell query.
3. Returns `not-ready` / error when pack is missing.

## Registration
- Add `import { findNearestBurgTool } from "./tools/find-nearest-burg";` in
  `src/ai/index.ts`.
- Add `registry.register(findNearestBurgTool);` near `listBurgsTool`.
- Add a re-export block:
  `export { createFindNearestBurgTool, defaultFindNearestBurgRuntime, findNearestBurgTool, findNearestBurgInPack, type FindNearestBurgRuntime } from "./tools/find-nearest-burg";`

## README_AI.md
Add a row right after the `list_burgs` row — same column shape (description
with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — baseline 2475 + new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT use `pack.cells.q` (the d3 quadtree) — that indexes cells, not
  burgs. A linear scan over `pack.burgs` is simple, correct, and O(N) where
  N is usually under a few thousand. A future optimization could build a
  quadtree over burgs if needed.
- We do NOT filter by state / culture / capital / port — that's `list_burgs`'s
  job. This tool answers only "which is geographically closest?".
- We do NOT expose the scaled population — caller can follow up with
  `list_burgs` if they want a richer summary.
