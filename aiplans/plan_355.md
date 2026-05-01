# Plan 355 — `split_route` AI chat tool

## Use case

Add an AI chat tool `split_route` that splits a single route into two
at a specified control-point index. The original route keeps
`points[0..index]`, and a new route is created with
`points[index..end]` (the split point is duplicated so each route's
endpoint terminates at the same cell).

This mirrors the "Split" button in the route editor — see the nested
`splitRoute` function inside `handleControlPointClick` at
`public/modules/ui/routes-editor.js:186-219`:

```js
function splitRoute() {
  const oldRoutePoints = route.points.slice(0, index + 1);
  const newRoutePoints = route.points.slice(index);

  // update old route
  route.points = oldRoutePoints;
  drawControlPoints(route.points);
  drawCells(route.points);
  redrawRoute(route);

  // create new route
  const newRoute = {
    i: Routes.getNextId(),
    group: route.group,
    feature: route.feature,
    name: route.name,
    points: newRoutePoints
  };
  pack.routes.push(newRoute);

  for (let i = 0; i < newRoute.points.length; i++) {
    const cellId = newRoute.points[i][2];
    const nextPoint = newRoute.points[i + 1];
    if (nextPoint) addConnection(cellId, nextPoint[2], newRoute.i);
  }

  routes
    .select("#" + newRoute.group)
    .append("path")
    .attr("d", Routes.getPath(newRoute))
    .attr("id", "route" + newRoute.i);
}
```

`addConnection` is private to `routes-editor.js`
(`public/modules/ui/routes-editor.js:329-337`):

```js
function addConnection(from, to, routeId) {
  const routes = pack.cells.routes;
  if (!routes[from]) routes[from] = {};
  routes[from][to] = routeId;
  if (!routes[to]) routes[to] = {};
  routes[to][from] = routeId;
}
```

The user can already split a route by clicking a control point in the
route editor and pressing the "Split" button. The AI cannot. We
already ship `add_route`, `remove_route`, `rename_route`,
`regenerate_route_name`, and group/lock siblings; this plan ships in
parallel with plan 354 (`join_routes`) — these two are direct
counterparts.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 813 files in 653ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Resolve the target route via a local lookup that walks
   `pack.routes` directly. Match by numeric `i` or case-insensitive
   `name`. Unlike `findRouteByRef` (which skips removed routes), this
   lookup also surfaces removed routes so we can emit the distinct
   `"Cannot split removed route ${i}."` error rather than masking it
   as "not found".
2. Validate `index` is an integer in `[1, route.points.length - 2]`
   inclusive. Picking either endpoint would produce an empty
   route (the legacy code allows it because the click handler is
   driven from a control-point selection, but the resulting route is
   meaningless). We add this guard explicitly. `maxIndex` in the error
   message reports `route.points.length - 2`.
3. Compute:
   - `oldPoints = route.points.slice(0, index + 1)` — original keeps
     0..index inclusive.
   - `newPoints = route.points.slice(index)` — new route starts at
     index inclusive, so the split point's triple appears in BOTH
     arrays. Both routes terminate at the same cell.
4. Mutate the original route IN PLACE: `route.points = oldPoints`.
   Object identity is preserved.
5. Construct the new route:
   ```ts
   const newRoute: RawRoute = {
     i: Routes.getNextId(),
     group: route.group,
     feature: route.feature,
     name: route.name, // may be undefined
     points: newPoints,
   };
   ```
   Only assign `name` if the original had one (avoid setting
   `name: undefined`).
6. Push `newRoute` onto `pack.routes`.
7. For each adjacent pair in `newPoints`, call our internal
   `addConnection(from, to, newRoute.i)` to overwrite
   `pack.cells.routes[from][to]` and `[to][from]` with the new id.
   This handles the "split" semantics for cells.routes:
   - The pair that straddled the split point originally stored
     `route.i` at `cells.routes[oldPoints.at(-1).cell][newPoints[1].cell]`.
     Walking newPoints adjacent pairs (starting from index 0 = the
     split point) overwrites that with `newRoute.i`. Subsequent pairs
     downstream get rewritten too. Net effect: cells beyond the split
     now connect via `newRoute.i` instead of `route.i`.
8. Best-effort rendering:
   - Look up the legacy D3 `routes` selection on `globalThis`. If it
     exposes `.select(id).append(...)`, append a `<path>` with
     `Routes.getPath(newRoute)` and `id="route{newRoute.i}"` —
     mirroring the legacy code.
   - Wrap in try/catch; data mutation is what matters.
   - Also call `drawRoutes()` if that global is present, matching the
     pattern in `add-route.ts`. (Both calls are idempotent and
     complementary — the first appends, the second re-renders.)
9. Return success summary.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "route": {
      "type": ["integer", "string"],
      "description": "Route id (matches route.i — note ids start at 0) or case-insensitive current name."
    },
    "index": {
      "type": "integer",
      "minimum": 1,
      "description": "Control-point index at which to split. Must be > 0 and < route.points.length - 1."
    }
  },
  "required": ["route", "index"]
}
```

## Validation

- Both fields required.
- `route` parsed via local route-ref parser (numeric id ≥ 0 or
  non-empty string — like `regenerate-route-name.ts`'s
  `parseRouteRef`, since route ids start at 0).
- `route` resolves to a non-removed route.
- `index` is an integer in `[1, route.points.length - 2]`.
- `pack.routes` is an array.
- `pack.cells.routes` is an object.
- `Routes.getNextId` is a function.

## Errors (verbatim)

- `"Route ${ref} not found."` — JSON-stringified ref (matches sibling
  conventions: `'No route found matching "Ghost".'` is the legacy
  alternative used by other tools, but the plan dispatch instructions
  spell out `"Route ${ref} not found."` so we honour that exactly).
- `"Cannot split removed route ${i}."`
- `"index must be an integer in [1, ${maxIndex}]."` — where
  `maxIndex = route.points.length - 2`.
- `"window.pack.routes is not available; the map hasn't finished loading."`
- `"window.pack.cells.routes is not available; the map hasn't finished loading."`
- `"Routes.getNextId is not available; the map hasn't finished loading."`
- Runtime errors are propagated as their `.message`.

## Success result

```jsonc
{
  "ok": true,
  "route": {
    "i": 5,
    "name": "Coast Road",
    "previous_point_count": 14,
    "point_count": 8
  },
  "new_route": {
    "i": 23,
    "name": "Coast Road",
    "point_count": 7
  },
  "split_at_index": 7
}
```

`name` is omitted from the body when the original had no name (rather
than emitted as `null`).

## Files

### NEW

- `src/ai/tools/split-route.ts` — the tool implementation.
- `src/ai/tools/split-route.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts` — import (alphabetically slotted near
  `splitRegimentTool`), re-export, and register inside
  `buildDefaultRegistry()` next to `splitRegimentTool`.

## Tests (Vitest)

Stub-runtime suite (mocks `find` / `split`):

1. happy path: route with 10 points, index=4 → original 5 points
   (0..4 inclusive), new 6 points (4..9 inclusive). Returned summary
   matches.
2. shared point identity: `oldPoints.at(-1) === newPoints.at(0)` (same
   cell id at the split point).
3. newRoute inherits `group`, `feature`, `name` from original.
4. newRoute id comes from `Routes.getNextId()` (verify via stub).
5. `pack.routes` length is `original + 1` after.
6. `pack.cells.routes` connections for the new route's adjacent point
   pairs reference `newRoute.i`, not `route.i`.
7. `index = 0` → error
   `"index must be an integer in [1, ${maxIndex}]."`.
8. `index = points.length - 1` → same error.
9. `index` out of range (negative, > length, fractional, `NaN`) →
   same error.
10. Bad `route` types (null/object/empty string/negative) → ref
    parser error.
11. `route` not found → `"Route ${ref} not found."`.
12. Removed route → `"Cannot split removed route ${i}."`.
13. In-place mutation: original route object identity preserved
    (capture reference before, assert `===` after).
14. Registry round-trip via `ToolRegistry`.
15. Default-runtime integration with `globalThis.pack` and
    `globalThis.Routes` (real `pack.routes` mutation, real
    `pack.cells.routes` rewrite).
16. Default-runtime missing `pack.routes` → error.
17. Default-runtime missing `pack.cells.routes` → error.
18. Default-runtime missing `Routes.getNextId` → error.
19. Default-runtime calls `getNextId()` and uses its return value.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

All must pass.

## Self-review

After drafting `tasks_355.md`, re-read both files with the following
checklist:

- [x] Split-point duplication is documented (Behavior §3) and tested
      (test 2 — shared cell-id identity at the boundary).
- [x] `pack.cells.routes` rewrite to `newRoute.i` is documented
      (Behavior §7) and tested both in stub form (test 6) and
      integration (test 15 walks the real adjacency map).
- [x] Index boundary tests cover both ends (test 7 for `index=0`,
      test 8 for `index=length-1`).
- [x] In-place mutation: original route object identity preserved
      (Behavior §4) and tested (test 13).
- [x] Inputs schema marks both `route` and `index` as required.
- [x] All "Errors (verbatim)" lines match what tests assert.
- [x] Pattern matches `add-route.ts` (runtime injection, default
      runtime, `getGlobal` for `Routes`/`drawRoutes`).
- [x] Plan honours the success-shape spec verbatim
      (`previous_point_count` / `point_count` / `split_at_index`).

### Corrections made during review

- Initial draft considered using `parseEntityRef` from `_shared`, but
  that helper requires a *positive* integer, which would reject
  `route: 0`. Routes start at id 0 (no placeholder slot — same
  rationale as `regenerate-route-name.ts`). Added a local
  `parseRouteRef` matching that file's pattern.
- Clarified that `name` is *omitted* from the success body when the
  original route had no name, rather than emitted as `null`. Matches
  the optional-field convention used by `add-route.ts` and keeps the
  output JSON minimal.
- Clarified that the legacy code's `addConnection` overwrite naturally
  handles the cells.routes rewrite for the boundary pair (no separate
  removeConnection needed); documented the mechanism in Behavior §7
  rather than a separate cleanup step.
