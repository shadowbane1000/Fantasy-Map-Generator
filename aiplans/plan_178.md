# Plan 178 — `find_cell_at_coords` AI tool

## Goal
Add a read-only AI tool that, given SVG pixel coordinates `(x, y)`, returns
the index of the packed-grid cell containing that point. This is the inverse
look-up of `get_cell_info` — which needs a cell index as input. Together they
let the assistant click anywhere on the map, resolve the cell, and then read
every property of that cell.

## Use case
Typical flow for the assistant:

1. User says "what's at the center of the map" or "tell me about the region
   around (420, 300)".
2. Call `find_cell_at_coords({ x: 420, y: 300 })` → `{ ok: true, cell: 1523,
   x: 420, y: 300 }`.
3. Follow up with `get_cell_info({ cell: 1523 })` or any cell-targeted
   mutation (`add_burg`, `add_marker`, …).

## Data flow
`window.findCell(x, y, radius?)` is defined in `src/utils/index.ts:197`:

```ts
window.findCell = (x: number, y: number, radius?: number) =>
  findClosestCell(x, y, radius, (window as any).pack);
```

and the underlying `findClosestCell` in `src/utils/graphUtils.ts:282` uses a
cached d3-quadtree built from `pack.cells.p`. It returns:

- `number` — the packed-cell index of the nearest cell to `(x, y)` (within
  `radius`, default `Infinity`).
- `undefined` — no cell within range (only happens if a finite `radius` was
  passed and nothing was within it; with the default `Infinity` the nearest
  cell is always returned when `pack.cells.p` is non-empty).

Throws `"Pack cells not found"` when `pack.cells.p` is missing (map not yet
generated).

## Tool shape
- Name: `find_cell_at_coords`
- Schema:
  - `x` (number, required): SVG-pixel X coordinate.
  - `y` (number, required): SVG-pixel Y coordinate.
- Returns on success: `{ ok: true, cell: <int>, x, y }`.
- Returns when no cell can be resolved (empty pack or `findCell` returns
  `undefined`): `{ ok: false, error: "No cell found at (x, y).", x, y }`
  via `errorResult`.
- Returns on un-generated map: `{ ok: false, error: "Map is not ready yet…" }`.

## Runtime seam
Mirror `defaultCellInfoRuntime` / `defaultZoomRuntime`:

```ts
export interface FindCellRuntime {
  findCell(x: number, y: number): number | null | "not-ready";
}
```

`defaultFindCellRuntime` reads `globalThis.findCell` (preferred, the global
set in `src/utils/index.ts`). When the global is missing it falls back to a
manual scan of `pack.cells.p` that picks the nearest point by squared
distance. When `pack` or `pack.cells.p` is missing it returns `"not-ready"`.

This seam lets tests inject a deterministic runtime without touching globals,
while the default path keeps parity with every other place in the codebase
that calls `findCell`.

## Input validation
- Reject missing `x` or `y`.
- Reject non-numeric (`typeof !== "number"`).
- Reject non-finite (`!Number.isFinite(v)` catches `NaN`, `Infinity`,
  `-Infinity`).
- Coordinates may be negative and may exceed `graphWidth` / `graphHeight` —
  `findCell` will still return the nearest cell (by quadtree). That's the
  established behaviour in `public/modules/ui/*-editor.js` consumers, so we
  don't clamp.

## Testing
Pure seam-block (no globals):

1. Returns `{ ok: true, cell, x, y }` for a fake runtime that returns a cell
   index.
2. Echoes the requested `x` / `y` back in the response.
3. Returns an error when the runtime returns `null`.
4. Returns a not-ready error when the runtime returns `"not-ready"`.
5. Rejects missing `x`.
6. Rejects missing `y`.
7. Rejects non-numeric `x` / `y` (`"1"`, `true`, `null`).
8. Rejects non-finite `x` / `y` (`NaN`, `Infinity`, `-Infinity`).
9. Accepts negative coordinates (passes through to runtime).
10. Accepts zero coordinates.
11. Exports `findCellAtCoordsTool` with the expected schema.

Integration block for `defaultFindCellRuntime`:

12. Resolves through `globalThis.findCell` when present.
13. Falls back to scanning `pack.cells.p` when `findCell` is missing.
14. Returns `"not-ready"` when `pack` is missing.
15. Returns `"not-ready"` when `pack.cells.p` is missing.

All integration tests write to `globalThis` inside `beforeEach` and restore
inside `afterEach` (same pattern as `get-cell-info.test.ts`).

## Files touched
- New: `src/ai/tools/find-cell-at-coords.ts`
- New: `src/ai/tools/find-cell-at-coords.test.ts`
- Edit: `src/ai/index.ts` — import, export block, registry.register call.
- Edit: `README_AI.md` — new row near `get_cell_info`.
- New: `aiplans/plan_178.md`, `aiplans/tasks_178.md`.

## Risks / non-goals
- No DOM mutation. Read-only lookup.
- No `radius` parameter — keep the surface minimal for now. The underlying
  `findCell` supports it if we ever want a bounded search.
- No coordinate-space conversion. Callers must pass SVG pixel coordinates
  (the same space burgs / markers live in).
