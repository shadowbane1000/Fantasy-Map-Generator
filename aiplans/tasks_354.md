# Tasks — Plan 354 (`join_routes`)

## 1. Implement the tool

- [ ] Create `src/ai/tools/join-routes.ts`.
  - Imports: `errorResult, getGlobal, getPack, okResult, type RawRoute`
    from `./_shared`; `Tool, ToolResult` from `./index`;
    `findRouteByRef` from `./rename-route`.
  - Export `MergeCase = "tail-head" | "head-tail" | "head-head" | "tail-tail"`.
  - Export interface `JoinRoutesRef`:
    - `i: number`
    - `name: string`
    - `points: number[][]` — already-coerced array form
    - `removed?: boolean`
  - Export interface `JoinRoutesRuntime` with:
    - `find(id: number): RawRoute | null` — returns the LIVE route
      object (so the caller can mutate `points` in place).
    - `apply(args: { route: RawRoute; other: RawRoute; mergedPoints: number[][]; mergeCase: MergeCase }): void`
      — mutates `route.points`, rebuilds adjacency for the merged
      path, calls `Routes.remove(other)`, best-effort calls
      `redrawRoute(route)`.
  - Export `defaultJoinRoutesRuntime`:
    - `find(id)`: uses `findRouteByRef(getPack<RoutePackLike>()?.routes, id)`.
    - `apply({route, other, mergedPoints, mergeCase})`:
      - Validate `pack.routes` exists, throw
        `"window.pack.routes is not available; the map hasn't finished loading."`.
      - Validate `pack.cells.routes` exists, throw
        `"window.pack.cells.routes is not available; the map hasn't finished loading."`.
      - Validate `globalThis.Routes.remove` is a function, throw
        `"Routes.remove is not available; the map hasn't finished loading."`.
      - Mutate `route.points = mergedPoints`.
      - For each adjacent pair `(from, to)` in `mergedPoints`, call
        the inline helper `addConnection(cellRoutes, from, to, route.i)`:
        ```ts
        if (!cellRoutes[from]) cellRoutes[from] = {};
        cellRoutes[from][to] = routeId;
        if (!cellRoutes[to]) cellRoutes[to] = {};
        cellRoutes[to][from] = routeId;
        ```
      - Call `routesModule.remove(other)`.
      - Best-effort: `const redraw = getGlobal<(r: RawRoute) => void>("redrawRoute");`
        if function, `try { redraw(route); } catch {}`.
  - Inline helper `parseRouteId(value, fieldName)`: returns
    `{ ok: true; id: number } | { ok: false; error: string }`. Accepts
    only integers `>= 0`. Error: `` `${fieldName} must be a non-negative integer id.` ``.
  - Inline helper `coerceRoutePoints(raw): number[][]` — same as
    `regenerate-route-name.ts` (filters non-arrays).
  - Inline helper `getEndpointCellId(points, which: "head" | "tail"): number | null`
    — returns `points[0]?.[2]` or `points[points.length - 1]?.[2]` if
    integer, else null.
  - Inline helper `determineMergeCase(routePoints, otherPoints): MergeCase | null`
    — runs the four checks in legacy order (tail-head, head-tail,
    head-head, tail-tail) and returns the first match, or null.
  - Inline helper `computeMergedPoints(routePoints, otherPoints, case): number[][]`
    — implements the four-branch concat. For head-head, reverse
    `routePoints`. For tail-tail, reverse `otherPoints`. **Take
    care**: clone before reversing (don't mutate the caller's array
    in the helper). Use `[...routePoints].reverse()`.
  - Export `createJoinRoutesTool(runtime?)` returning a `Tool`:
    - name: `join_routes`
    - description: explains merging two routes that share an endpoint
      cell. Mentions that the survivor extends and the joined route
      is removed via `Routes.remove`. Notes that the four endpoint
      cases are tried in legacy order (tail-head, head-tail,
      head-head, tail-tail). Mentions `merge_case` in the result.
      Cross-reference: "mirrors the route editor's Join dialog".
    - input_schema as in plan.
    - execute:
      1. Parse `route` via `parseRouteId(input.route, "route")`.
      2. Parse `other` via `parseRouteId(input.other, "other")`.
      3. If `route === other`: error
         `"route and other must be different route ids."`.
      4. `routeObj = runtime.find(routeId)`; if null: error
         `` `Route ${routeId} not found.` ``.
      5. `otherObj = runtime.find(otherId)`; if null: error
         `` `Route ${otherId} not found.` ``.
      6. Coerce both routes' points; determine merge case. If null:
         error
         `` `Routes ${routeId} and ${otherId} do not share an endpoint cell. Cannot join.` ``.
      7. Compute merged points.
      8. `previousPointCount = routePoints.length`; capture
         `previousName = routeObj.name ?? ""` and
         `joinedName = otherObj.name ?? ""`.
      9. Try `runtime.apply({ route: routeObj, other: otherObj, mergedPoints, mergeCase })`;
         catch → propagate `.message`.
     10. Return `okResult({ route: { i, name, previous_point_count, point_count }, joined_route: { i, name, removed: true }, merge_case })`.
  - Export `joinRoutesTool = createJoinRoutesTool()`.

## 2. Tests

- [ ] Create `src/ai/tools/join-routes.test.ts`.
  - Build a `makeRuntime()` helper that returns runtime + mock fns
    + a state record allowing per-test override of `find` and
    capturing `apply` args.
  - Stub-runtime suite covers the 19 cases enumerated in plan
    (tests 1–19).
  - Default-runtime integration suite covers tests 20–28 with a
    populated `globalThis.pack` and `globalThis.Routes`. Use
    `beforeEach`/`afterEach` to set up and tear down the globals
    (mirror `regenerate-route-name.test.ts`).
  - For integration tests, build a small `pack` with:
    - `routes: [route, other]` with `points` arrays,
    - `cells.routes: {}` populated with the existing per-route
      adjacency entries (so we can verify `Routes.remove`'s scrub).
  - For tests asserting the surviving route's identity (test 17),
    capture the original reference and compare with `===`.
  - For test 26, spy on `Routes.remove` with `vi.fn()` and assert
    `mock.calls[0][0]` is the joined route reference.

## 3. Wire up registry

- [ ] In `src/ai/index.ts`:
  - Import `joinRoutesTool` alphabetically — insert between
    `import { invertMarkerPinsTool }` (line ~142) and
    `import { listBiomesTool }` (line ~143).
  - Re-export `createJoinRoutesTool, defaultJoinRoutesRuntime, type JoinRoutesRuntime, joinRoutesTool`
    from `./tools/join-routes` — insert above the `list-biomes`
    re-export block (right after the `invert-marker-pins` block
    around line 1642).
  - Register `joinRoutesTool` inside `buildDefaultRegistry()` next
    to the other route tools (around line 3017, after
    `addRouteGroupTool`). Ordering inside this function isn't
    strictly alphabetical, just append next to the route tools
    cluster.

## 4. Verify

- [ ] `npm test` — all tests green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.

## 5. Commit

- [ ] Stage `src/ai/tools/join-routes.ts`,
  `src/ai/tools/join-routes.test.ts`, `src/ai/index.ts`,
  `aiplans/plan_354.md`, `aiplans/tasks_354.md`.
- [ ] Commit with message:

```
feat(ai): add join_routes tool

Implements plan 354. Adds an AI chat tool that merges two routes that
share an endpoint cell — the surviving route's points are extended
(possibly after reversing one route), pack.cells.routes is rebuilt,
and the joined route is removed via Routes.remove. Mirrors the "Join"
dialog in the route editor.
```

- [ ] Do NOT push.
