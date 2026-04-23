# Plan 229 — find_routes_by_group AI tool

## Goal
Add a read-only `find_routes_by_group` tool that lists every active
route in `pack.routes` whose `route.group` matches a caller-supplied
group label — the group-only parallel to `find_burgs_by_type` /
`find_markers_by_type` and the unpaginated, filter-first companion to
`list_routes` (which paginates and supports the same group filter).

## Why
`list_routes` already filters by group, but as a paginated list tool
the group is optional and the response is capped at 500 entries with
offset/limit pagination. For AI workflows that need *every* road or
*every* sea lane — e.g. audit all sea lanes, feed route ids into
bulk `set_route_group` / `rename_route` / `remove_route` calls —
paging is friction. `find_routes_by_group` mirrors the existing
`find_*_by_*` naming convention and returns the full list up to a
10 000 default cap (100 000 max), matching
`find_markers_by_type`.

## Data source
- `window.pack.routes` (typed as `RawRoute[]`), same array driven by
  the Routes Editor / Routes Overview.
- Each `RawRoute` has optional `group?: string` (canonical values:
  `"roads"`, `"trails"`, `"searoutes"`), plus `i`, optional `name`,
  optional `feature`, optional `points` array, optional `removed`
  flag.

## Tool shape
- Name: `find_routes_by_group`.
- Description: group-only parallel of `list_routes` filter; calls out
  the no-pagination, single-call return-everything nature; mentions
  canonical `ROUTE_GROUPS` + alias support via `resolveRouteGroup`;
  notes that `name` / length / points are populated lazily in the UI
  so removed/unprocessed routes may report empty name and zero
  points.
- Input schema:
  - `group` (string, **required**) — matched case-insensitively
    against `ROUTE_GROUPS` via `resolveRouteGroup` (accepts
    canonical + aliases like `"road"`, `"trail"`, `"sea lanes"`).
  - `limit` (integer, optional, default 10000, max 100000) —
    caps the returned `routes` array; `count` always reports the
    full unlimited total.
- Output: `{ ok, group, routes: [{ i, name, group, feature, points_count }], count }`.
  - `i` — `route.i` (numeric id, matches `route.i`, not array index).
  - `name` — `route.name` when a string else `null`.
  - `group` — the canonical group (echo of resolved filter).
  - `feature` — `route.feature` when a finite number else `null`.
  - `points_count` — `route.points.length` when an array else `0`.

## Runtime seam
- `FindRoutesByGroupRuntime { find(query): FindRoutesByGroupResult }`.
- `defaultFindRoutesByGroupRuntime` delegates to the pure scanner
  `findRoutesByGroupInPack(getPack<PackLike>(), query)`.
- Pure scanner iterates `pack.routes`, skips falsy slots and
  `removed: true` routes, compares `route.group` case-insensitively
  to the resolved canonical group. Returns `"not-ready"` sentinel
  when `pack` or `pack.routes` is missing.

## Validation
- Missing / null `group` → `errorResult("group is required.", { supported: [...ROUTE_GROUPS] })`.
- Non-string `group` → error with supported list.
- Empty / whitespace-only `group` → error with supported list.
- Unknown `group` (`resolveRouteGroup` returned null) → error with
  supported list.
- `limit` validated as integer in `[1, 100000]`; defaults to 10000
  when missing. Out of range / non-integer / NaN → error.

## Response shape
```
{ ok: true, group: "roads", routes: [ { i, name, group, feature, points_count }, ... ], count: N }
```
When no route matches, `routes: []` and `count: 0` (still `ok: true`).

## Testing
Mirror `find-markers-by-type.test.ts`:
- Unit tests against `findRoutesByGroupInPack`:
  - Matches case-insensitively, supports all canonical groups.
  - Returns canonical group in the payload even when caller passed
    alias / different casing.
  - Skips removed routes and null slots.
  - `limit` truncates `routes` but `count` stays full.
  - `not-ready` when pack / pack.routes undefined.
  - `points_count` = 0 when points missing or non-array.
  - Empty result for a group with no matches.
- Tool surface tests:
  - Rejects missing / non-string / empty group with supported
    list echo.
  - Rejects unknown group.
  - Accepts aliases (`"road"`, `"sea lanes"`).
  - Rejects out-of-range `limit`.
  - Accepts boundary limits (1, MAX).
  - Surfaces `not-ready` as a structured error.
  - End-to-end ok payload.
- `defaultFindRoutesByGroupRuntime` integration block:
  - `(globalThis as unknown as { pack?: unknown }).pack = makePack() as unknown`
    in `beforeEach`; restore original in `afterEach`.
  - Confirms the real default path reads the stubbed pack.
  - Confirms `not-ready` surfaces when pack undefined.

## Wiring
- Import & register in `src/ai/index.ts` near `listRoutesTool`.
- Barrel re-exports: `createFindRoutesByGroupTool`,
  `DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT`,
  `MAX_FIND_ROUTES_BY_GROUP_LIMIT`,
  `defaultFindRoutesByGroupRuntime`,
  `findRoutesByGroupInPack`, `findRoutesByGroupTool`, and types
  (`FindRoutesByGroupHit`, `FindRoutesByGroupPayload`,
   `FindRoutesByGroupQuery`, `FindRoutesByGroupResult`,
   `FindRoutesByGroupRuntime`).
  Do **not** re-export `ROUTE_GROUPS` / `resolveRouteGroup` again —
  those already come from `./tools/list-routes`.
- README_AI.md: add a row immediately below the `list_routes` row,
  one-line pipe-table style, including the API key note.

## Out of scope
- Route creation / mutation (existing `add_route`,
  `set_route_group`, `remove_route` handle that).
- Spatial filtering — callers can fetch everything and filter
  client-side, or combine with `get_route_info` / `list_routes`
  with `min_length`.

## Verify
- `npm run build` — `tsc && vite build` both clean.
- `npm test` — baseline 3683 → 3683 + new cases pass.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors preserved.
