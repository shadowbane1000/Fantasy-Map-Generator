# Tasks 229 — find_routes_by_group AI tool

- [ ] Create `src/ai/tools/find-routes-by-group.ts`:
  - Imports: `errorResult`, `getPack`, `okResult`, `type RawRoute`
    from `./_shared`; `Tool`, `ToolResult` from `./index`;
    `ROUTE_GROUPS`, `type RouteGroup`, `resolveRouteGroup` from
    `./list-routes`.
  - Constants: `DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT = 10000`,
    `MAX_FIND_ROUTES_BY_GROUP_LIMIT = 100000`.
  - Types:
    - `FindRoutesByGroupHit { i, name: string | null, group: RouteGroup, feature: number | null, points_count: number }`.
    - `FindRoutesByGroupPayload { group: RouteGroup; routes: FindRoutesByGroupHit[]; count: number }`.
    - `FindRoutesByGroupQuery { group: RouteGroup; limit: number }`.
    - `FindRoutesByGroupResult = FindRoutesByGroupPayload | "not-ready"`.
    - `FindRoutesByGroupRuntime { find(q): FindRoutesByGroupResult }`.
  - Internal `PackLike { routes?: RawRoute[] }`.
  - Pure scanner `findRoutesByGroupInPack(pack, query)`:
    - Return `"not-ready"` when `pack` or `pack.routes` missing.
    - Iterate `pack.routes`, skip falsy / `removed` / non-string
      group / mismatched group (case-insensitive). Skip any slot
      whose `route.group !== query.group` (both pre-normalised).
    - For each match: `count++`; if `routes.length < cap`, push
      `{ i, name: string|null, group: query.group, feature: number|null, points_count }`.
    - Return `{ group: query.group, routes, count }`.
  - `defaultFindRoutesByGroupRuntime` delegates to
    `findRoutesByGroupInPack(getPack<PackLike>(), query)`.
  - Helpers:
    - `parseLimit(raw)`: same semantics as in
      `find-markers-by-type.ts`.
    - `parseInput(rawInput)`: group resolution → RouteGroup or
      error; limit parse; returns `{ query? , error? }`.
  - `createFindRoutesByGroupTool(runtime?)`:
    - Name: `find_routes_by_group`.
    - Description: explains parallel with `find_markers_by_type`,
      full-list-single-call semantics, canonical groups + aliases,
      lazy `route.name` gotcha, API key note.
    - `input_schema.required = ["group"]`.
    - Schema properties: `group` (string) and `limit`
      (integer, min 1, max MAX).
    - `execute`: parse → runtime.find → `okResult({ group, routes, count })`
      or `errorResult("Map is not ready yet …")` when "not-ready".
  - Export `findRoutesByGroupTool = createFindRoutesByGroupTool()`.

- [ ] Write `src/ai/tools/find-routes-by-group.test.ts`:
  - Imports mirror `find-markers-by-type.test.ts`.
  - `makePack()` fixture with:
    - Road routes (varied casing of group? No — spec says match
      via resolveRouteGroup, which normalises input; route.group
      is always canonical lowercase in real data. Test case-
      insensitive compare by setting one route's group to
      `"Roads"` uppercase and asserting it is still returned).
    - Trail routes, searoute entries.
    - `removed: true` entry (skipped).
    - Entry with missing `group` (skipped).
    - Null slot (tolerated).
    - Entry with no `points` (points_count = 0).
  - Pure-scanner unit tests:
    - Matches by group, returns canonical group in payload.
    - Case-insensitive match on `route.group`.
    - Skips removed routes + null slots.
    - `points_count` = 0 for missing / non-array points.
    - `feature` = null when missing / non-number.
    - `name` = null when missing / non-string.
    - `limit` truncates routes but `count` stays full.
    - `not-ready` when pack undefined / `pack.routes` missing.
  - Tool surface tests:
    - Rejects missing / non-string / empty group (error echoes
      `supported: ROUTE_GROUPS`).
    - Rejects unknown group.
    - Accepts aliases (`"road"`, `"sea lanes"`, `"TRAIL"`).
    - Rejects out-of-range / non-integer / NaN `limit`.
    - Accepts boundary limits (1 and MAX).
    - Surfaces `not-ready` as a structured error.
    - End-to-end ok payload with expected canonical group.
    - Exposes `DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT` and
      `MAX_FIND_ROUTES_BY_GROUP_LIMIT` constants.
    - `findRoutesByGroupTool` has `name = "find_routes_by_group"`
      and `input_schema.required = ["group"]`.
  - `defaultFindRoutesByGroupRuntime` integration block:
    - `const globalsRef = globalThis as unknown as { pack?: unknown };`
    - `beforeEach` stubs pack; `afterEach` restores.
    - Asserts real default path matches on "roads" query.
    - Asserts `not-ready` surfaces to tool error when pack
      undefined.

- [ ] Register in `src/ai/index.ts`:
  - Add `import { findRoutesByGroupTool } from "./tools/find-routes-by-group";`
    in alphabetical position (after `findNearestRiverTool`,
    before `findProvincesByStateTool`).
  - Add barrel re-export block with
    `createFindRoutesByGroupTool`,
    `DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT`,
    `defaultFindRoutesByGroupRuntime`, types,
    `findRoutesByGroupInPack`, `findRoutesByGroupTool`,
    `MAX_FIND_ROUTES_BY_GROUP_LIMIT`.
  - `registry.register(findRoutesByGroupTool)` immediately after
    `registry.register(listRoutesTool)`.
  - Do NOT re-export `ROUTE_GROUPS` / `resolveRouteGroup` — they
    already come from `./tools/list-routes`.

- [ ] Update `README_AI.md`:
  - Add a single-line pipe-table row directly below the
    `list_routes` row describing the new tool, canonical groups,
    alias support, `limit` default / max, response shape, and
    the API key note.

- [ ] Verify:
  - `npm run lint` — preserve baseline 7 warnings / 1 info /
    0 errors.
  - `npm run build` — clean `tsc && vite build`.
  - `npm test` — baseline 3683 → 3683 + new cases.

- [ ] Commit `feat(ai): add find_routes_by_group tool` with a
  1-2-line body about the parallel to `find_markers_by_type`.
