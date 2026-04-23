# Plan 197 — add `find_nearest_marker` AI tool

## Goal
Add a read-only AI tool that returns the nearest non-removed marker
to a query point (either an `(x, y)` coordinate pair or a `cell` id),
with an optional `type` filter. Direct parallel of
`find_nearest_burg` but targeting `pack.markers`.

## Why
Agents can already find the nearest **burg** to a point via
`find_nearest_burg`. There is no equivalent for **markers** (POIs).
Given a region / cell of interest, the LLM needs a cheap way to
locate a relevant marker (e.g. the closest castle, shipwreck, or
mine) before running any marker-targeted tool
(`set_marker_type`, `set_marker_icon`, `set_marker_colors`,
`set_marker_pin`, `move_marker`, `remove_marker`, etc.). The
optional `type` filter lets callers ask "closest castle" instead of
"closest marker", without listing-and-sorting the whole pack.

## Shape

Tool name: `find_nearest_marker`

Input (exactly one of `(x, y)` or `cell`):
- `x` (number) — x coord of the query point. Paired with `y`.
  Mutually exclusive with `cell`.
- `y` (number) — y coord of the query point. Paired with `x`.
  Mutually exclusive with `cell`.
- `cell` (integer, >= 0) — packed cell index whose centroid
  (`pack.cells.p[cell]`) is the query point. Mutually exclusive
  with `x` / `y`.
- `type` (string, optional) — filters `pack.markers` by exact
  case-insensitive match of `marker.type`. When absent, all active
  markers are considered.

Behavior:
- Read-only.
- Validate input.
- Validate `pack.markers` is present (`not-ready`).
- Resolve query point from `cell` via `pack.cells.p[cell]`, or from
  `(x, y)`.
- Iterate `pack.markers`, skip entries with `removed: true`, skip
  entries whose `type` doesn't match the filter (when set), compute
  `Math.sqrt(dx*dx + dy*dy)`, track the smallest distance.
- Return `{ ok, i, type, icon, x, y, distance }` for the winner, or
  `{ ok: true, i: null, type: null, icon: null, x: null, y: null,
  distance: null }` if no marker matched.

## Files

- `src/ai/tools/find-nearest-marker.ts` — runtime-seam tool.
- `src/ai/tools/find-nearest-marker.test.ts` — pure / seam tests
  plus `defaultFindNearestMarkerRuntime` integration block (sets
  `globalThis.pack`).
- `src/ai/index.ts` — import, register, re-export.
- `README_AI.md` — add row near `find_nearest_burg` / `list_markers`.

## Architecture

Mirror `find-nearest-burg.ts` exactly (cell-or-coords duality) with
the extra `type` filter carried through the query union:

- `export interface FindNearestMarkerHit { i: number; type: string |
  null; icon: string | null; x: number; y: number; distance: number }`
- `export type FindNearestMarkerQuery =
     | { kind: "coords"; x: number; y: number; type: string | null }
     | { kind: "cell"; cell: number; type: string | null }`
- `export type FindNearestMarkerOutcome = FindNearestMarkerHit | {
     i: null; type: null; icon: null; x: null; y: null; distance: null }`
- `export type FindNearestMarkerResult = FindNearestMarkerOutcome |
     "not-ready" | "out-of-bounds" | "no-cell-point"`
- `export function findNearestMarkerInPack(pack, query):
     FindNearestMarkerResult`
- `export interface FindNearestMarkerRuntime {
     findNearest(query): FindNearestMarkerResult }`
- `export const defaultFindNearestMarkerRuntime` — reads from
  `getPack<PackLike>()` via `_shared/globals.ts`.
- `export function createFindNearestMarkerTool(runtime = default):
     Tool`
- `export const findNearestMarkerTool = createFindNearestMarkerTool()`

`PackLike`:
```
{
  markers?: RawMarker[];
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}
```

Input schema (no `required[]` — oneOf logic is runtime):
```
{
  x: number,
  y: number,
  cell: integer (minimum 0),
  type: string,
}
```

Type filter: if present, `marker.type` must equal the filter
case-insensitively. A marker with `type === undefined` never matches
a non-null filter.

## Validation / edge cases

- `pack` / `pack.markers` missing → `"not-ready"`.
- Neither `(x, y)` nor `cell` → input error.
- Both `(x, y)` and `cell` → input error.
- Partial coords (only `x` or only `y`) → input error.
- Non-finite `x` / `y` → input error.
- `cell` not a non-negative integer → input error.
- `cell` out of bounds (`>= pack.cells.i.length`) → `"out-of-bounds"`.
- `cell` with no coords in `pack.cells.p` → `"no-cell-point"`.
- `type` provided but not a non-empty string → input error.
- No matching marker (empty `pack.markers`, all removed, or type
  filter excluded all) → `{ ok: true, i: null, ... }`.

## Tests

Pure / seam:
- coordinate query returns the closest active marker.
- cell query resolves `pack.cells.p[cell]` then returns closest.
- skips removed markers.
- skips markers that don't match `type` filter when set.
- type filter is case-insensitive.
- breaks ties deterministically by iteration order.
- distance is Euclidean from the query point.
- returns `{ i: null, ... }` when `pack.markers` is empty.
- returns `{ i: null, ... }` when all markers are filtered out.
- `"not-ready"` when pack / markers missing.
- `"out-of-bounds"` when cell >= cells.i.length.
- `"no-cell-point"` when cells.p[cell] is undefined.

Tool surface:
- rejects both / neither / partial input.
- rejects non-finite `x` / `y`.
- rejects non-integer / negative `cell`.
- rejects empty-string / non-string `type`.
- surfaces `"not-ready"` / `"out-of-bounds"` / `"no-cell-point"` as
  structured errors (runtime stubs).
- returns `ok: true, i: null, ...` when no active markers.
- happy path returns `{ ok: true, i, type, icon, x, y, distance }`.
- schema spot-check (properties + no top-level required).

Integration (`defaultFindNearestMarkerRuntime`):
- with `globalThis.pack` seeded, reads a real pack for coord query.
- cell-form query through default runtime.
- `globalThis.pack = undefined` → tool returns "not ready"
  structured error.

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite count.

## Out of scope

- Matching `note.name` / legend: this tool is a geometry primitive;
  use `get_marker_info` / `list_markers` to resolve by name.
- Multiple matches / sorted top-N: use `list_markers` (paginated) if
  bulk listing is needed.
- Radius queries / polygon filters: potential future tools parallel
  to `find_cells_in_radius`.
