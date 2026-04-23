# Plan 205 — `find_burgs_in_area` AI tool

## Goal

Add a read-only AI tool `find_burgs_in_area` that enumerates every active burg
whose coordinates fall inside a caller-specified rectangular OR circular area.
This is the burg parallel of `find_cells_in_radius` and the many-burg parallel
of `find_nearest_burg`.

## Motivation

`find_nearest_burg` returns one burg closest to a point. `list_burgs` lists
every burg on the map. There is no "enumerate burgs in this region" tool. Agents
that need to operate on all burgs in a state-less region, or audit burgs near a
feature, currently have to pull the full `list_burgs` payload and filter
client-side. A dedicated spatial filter mirrors `find_cells_in_radius` and keeps
token usage low.

## API

Two mutually exclusive area forms. Validation happens in `parseInput`:

1. **Rectangle** — `x1`, `y1`, `x2`, `y2` (all finite numbers). The rectangle
   is normalized so `x1 <= x2` and `y1 <= y2` (callers can pass corners in any
   order). Boundary burgs (x === x1 or x === x2 etc.) are included.
2. **Circle** — `radius` (finite, >= 0) plus center. Center is given either as
   `x` + `y` (both finite) OR `cell` (non-negative integer; resolved via
   `pack.cells.p[cell]`). The two center forms are mutually exclusive.

Optional `limit` — integer in [1, 100000], default 10000. Caps the returned
`burgs` array; `count` reports the full total anyway.

## Output shape

Happy path:

```
{
  ok: true,
  burgs: [
    { i: 123, name: "Aldport", x: 400, y: 310, distance: 12.5 },   // circle
    { i: 124, name: "Burn",    x: 420, y: 305, distance: null }    // rectangle
  ],
  count: 2,
  area:
    { kind: "rect",   x1: 400, y1: 300, x2: 500, y2: 400 }
  // — or —
    { kind: "circle", x: 450, y: 350, radius: 100 }
}
```

`distance` is populated only for circle queries (Euclidean pixel distance from
center). For rectangle queries it's `null` — no natural single distance fits.

## Core scanner

`findBurgsInAreaInPack(pack, query)`:

- Returns `"not-ready"` when `pack` or `pack.burgs` is missing.
- For circle queries, returns `"out-of-bounds"` or `"no-cell-point"` when the
  cell form can't resolve a center (same strings as `find_cells_in_radius`).
- Iterates `pack.burgs`, skipping `i === 0` and `removed === true`.
- Rectangle: `x in [x1, x2] && y in [y1, y2]` (inclusive).
- Circle: `dx*dx + dy*dy <= radius*radius` (squared distance; sqrt only for
  included burgs so we can report `distance`).
- Caps output at `limit` but continues counting until the end of the array.

## Runtime seam

```ts
export interface FindBurgsInAreaRuntime {
  find(query: FindBurgsInAreaQuery): FindBurgsInAreaResult;
}
```

`defaultFindBurgsInAreaRuntime.find()` reads `window.pack` via the shared
`getPack<PackLike>()` helper. Tests use `createFindBurgsInAreaTool(customRuntime)`
to inject a fake; an integration describe block at the bottom stubs
`globalThis.pack` through `as unknown as { pack?: unknown }`.

## Registration

- `src/ai/tools/find-burgs-in-area.ts` — runtime-seam tool.
- `src/ai/tools/find-burgs-in-area.test.ts` — unit + integration describe.
- `src/ai/index.ts` — import, re-export create-fn / default runtime / types,
  register in `buildDefaultRegistry` near `findNearestBurgTool`.
- `README_AI.md` — add a row directly after `find_nearest_burg` (line 59).

## Tests

Pure / seam:

- rectangle form returns every active burg inside the box (inclusive on edges)
- rectangle normalises reversed corners (x1 > x2 and/or y1 > y2)
- circle form (coords): every burg inside radius, distance populated, boundary
  burgs included
- circle form (cell): resolves center via `pack.cells.p[cell]`
- radius 0 returns only burgs exactly at center
- `limit` truncates but `count` reports full total
- skips i=0 placeholder and `removed: true` burgs
- skips burgs missing `x` / `y`
- returns empty list + count 0 when no burgs match
- returns `"not-ready"` for undefined pack or pack without burgs
- circle form returns `"out-of-bounds"` / `"no-cell-point"` for bad cell

Tool surface:

- rejects when no area supplied
- rejects when rect and circle params mixed
- rejects when rect missing any of x1/y1/x2/y2
- rejects non-finite rect corners
- rejects non-finite x/y, non-integer / negative cell
- rejects missing / non-finite / negative radius in circle form
- rejects out-of-range `limit`
- accepts radius = 0
- surfaces `"not-ready"` / `"out-of-bounds"` / `"no-cell-point"` as structured
  errors
- happy-path rect and circle with `area` echoed back
- `findBurgsInAreaTool` exports expected schema

Integration (`defaultFindBurgsInAreaRuntime`):

- stubs `globalThis.pack` (beforeEach / afterEach) with a small burg set, runs
  both rectangle and circle queries through `defaultFindBurgsInAreaRuntime.find`
- asserts tool execution surfaces `"not-ready"` when pack is cleared

## Non-goals

- Ellipse / polygon support — out of scope.
- State / culture / type filters — use `list_burgs` when that's needed.
- Returning population / state / culture per burg — keep payload lean; callers
  can follow up with `get_burg_info` if they need more.
- Sorting by distance — output order matches iteration order of `pack.burgs`
  for determinism. Callers can sort client-side if they need it.
