# Plan 207 — `find_markers_in_area` AI tool

## Goal

Add a read-only AI tool `find_markers_in_area` that enumerates every active
marker whose coordinates fall inside a caller-specified rectangular OR circular
area. This is the marker parallel of the just-merged `find_burgs_in_area` and
the many-marker parallel of `find_nearest_marker`.

## Motivation

`find_nearest_marker` returns one marker closest to a point. `list_markers`
lists every marker on the map (paginated). There is no "enumerate markers in
this region" tool. Agents that want to audit every castle in a province-shaped
box, or batch-operate on markers near a feature, currently have to pull the
full `list_markers` payload and filter client-side. A dedicated spatial filter
mirrors `find_burgs_in_area` and keeps token usage low.

## API

Two mutually exclusive area forms. Validation happens in `parseInput`:

1. **Rectangle** — `x1`, `y1`, `x2`, `y2` (all finite numbers). The rectangle
   is normalized so `x1 <= x2` and `y1 <= y2` (callers can pass corners in any
   order). Boundary markers are included.
2. **Circle** — `radius` (finite, >= 0) plus center. Center is given either as
   `x` + `y` (both finite) OR `cell` (non-negative integer; resolved via
   `pack.cells.p[cell]`). The two center forms are mutually exclusive.

Optional `type` — non-empty string. Case-insensitive exact match of
`marker.type` (e.g. `castle`, `battlefield`). Same semantics as
`find_nearest_marker`'s `type` filter.

Optional `limit` — integer in [1, 100000], default 10000. Caps the returned
`markers` array; `count` reports the full total anyway.

## Output shape

Happy path:

```
{
  ok: true,
  markers: [
    { i: 42, type: "castle", icon: "castle", x: 400, y: 310, distance: 12.5 },
    { i: 43, type: "mine",   icon: "mine",   x: 420, y: 305, distance: null }
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
`type` and `icon` are the marker's raw values or `null` when missing.

## Core scanner

`findMarkersInAreaInPack(pack, query)`:

- Returns `"not-ready"` when `pack` or `pack.markers` is missing.
- For circle queries, returns `"out-of-bounds"` or `"no-cell-point"` when the
  cell form can't resolve a center (same strings as `find_burgs_in_area`).
- Iterates `pack.markers`, skipping `removed === true`. Markers have no index-0
  placeholder convention (unlike burgs), so no `i === 0` skip.
- When `type` filter is set: skips markers whose `marker.type` (string) does
  not match case-insensitively.
- Rectangle: `x in [x1, x2] && y in [y1, y2]` (inclusive).
- Circle: `dx*dx + dy*dy <= radius*radius` (squared distance; sqrt only for
  included markers so we can report `distance`).
- Caps output at `limit` but continues counting until the end of the array.

## Runtime seam

```ts
export interface FindMarkersInAreaRuntime {
  find(query: FindMarkersInAreaQuery): FindMarkersInAreaResult;
}
```

`defaultFindMarkersInAreaRuntime.find()` reads `window.pack` via the shared
`getPack<PackLike>()` helper. Tests use
`createFindMarkersInAreaTool(customRuntime)` to inject a fake; an integration
describe block at the bottom stubs `globalThis.pack` through
`as unknown as { pack?: unknown }`.

## Registration

- `src/ai/tools/find-markers-in-area.ts` — runtime-seam tool.
- `src/ai/tools/find-markers-in-area.test.ts` — unit + integration describe.
- `src/ai/index.ts` — import, re-export create-fn / default runtime / types,
  register in `buildDefaultRegistry` near `findNearestMarkerTool`.
- `README_AI.md` — add a row directly after `find_nearest_marker`.

## Tests

Pure / seam:

- rectangle form returns every active marker inside the box (inclusive on edges)
- rectangle normalises reversed corners (x1 > x2 and/or y1 > y2)
- circle form (coords): every marker inside radius, distance populated, boundary
  markers included
- circle form (cell): resolves center via `pack.cells.p[cell]`
- radius 0 returns only markers exactly at center
- `limit` truncates but `count` reports full total
- skips `removed: true` markers
- skips markers missing `x` / `y`
- `type` filter (case-insensitive exact) includes only matching markers
- `type` filter excludes markers whose `type` is missing / not a string
- returns empty list + count 0 when no markers match
- returns `"not-ready"` for undefined pack or pack without markers
- circle form returns `"out-of-bounds"` / `"no-cell-point"` for bad cell

Tool surface:

- rejects when no area supplied
- rejects when rect and circle params mixed
- rejects when rect missing any of x1/y1/x2/y2
- rejects non-finite rect corners
- rejects non-finite x/y, non-integer / negative cell
- rejects missing / non-finite / negative radius in circle form
- rejects empty-string / non-string `type`
- rejects out-of-range `limit`
- accepts radius = 0
- surfaces `"not-ready"` / `"out-of-bounds"` / `"no-cell-point"` as structured
  errors
- happy-path rect and circle with `area` echoed back
- `type` filter applied end-to-end
- `findMarkersInAreaTool` exports expected schema

Integration (`defaultFindMarkersInAreaRuntime`):

- stubs `globalThis.pack` (beforeEach / afterEach) with a small marker set, runs
  both rectangle and circle queries through
  `defaultFindMarkersInAreaRuntime.find`
- asserts tool execution surfaces `"not-ready"` when pack is cleared

## Non-goals

- Ellipse / polygon support — out of scope.
- `pinned_only` / `lock` filters — add later if demand appears; keep parity with
  `find_burgs_in_area`.
- Returning name / legend per marker — payload stays lean; callers can follow
  up with `get_marker_info` if they need more.
- Sorting by distance — output order matches iteration order of `pack.markers`
  for determinism. Callers can sort client-side if they need it.
