# Plan 354 — `join_routes` AI chat tool

## Use case

Add an AI chat tool `join_routes` that merges two routes that share an
endpoint cell into a single surviving route. The "joined" route is
removed; the surviving route's `points` array is extended (potentially
after reversing one of the two routes so the shared endpoint sits in
the middle of the merged sequence).

This mirrors the legacy `joinRoutes` helper inside the route editor:
`public/modules/ui/routes-editor.js:287-312`. The user can already
trigger this by clicking the "Join" button in the route editor and
picking a target route from the resulting dialog. The AI cannot.

```js
// public/modules/ui/routes-editor.js:287
function joinRoutes(route, joinedRoute) {
  if (route.points.at(-1)[2] === joinedRoute.points.at(0)[2]) {
    // joinedRoute starts at the end of current route → tail-head
    route.points = [...route.points, ...joinedRoute.points.slice(1)];
  } else if (route.points.at(0)[2] === joinedRoute.points.at(-1)[2]) {
    // joinedRoute ends at the start of current route → head-tail
    route.points = [...joinedRoute.points, ...route.points.slice(1)];
  } else if (route.points.at(0)[2] === joinedRoute.points.at(0)[2]) {
    // both start at the same cell → head-head (reverse current, then append)
    route.points = [...route.points.reverse(), ...joinedRoute.points.slice(1)];
  } else if (route.points.at(-1)[2] === joinedRoute.points.at(-1)[2]) {
    // both end at the same cell → tail-tail (reverse joined, then append)
    route.points = [...route.points, ...joinedRoute.points.reverse().slice(1)];
  }
  // otherwise: no shared endpoint — legacy code does nothing (silent no-op).

  for (let i = 0; i < route.points.length; i++) {
    const point = route.points[i];
    const nextPoint = route.points[i + 1];
    if (nextPoint) addConnection(point[2], nextPoint[2], route.i);
  }

  Routes.remove(joinedRoute);
  drawControlPoints(route.points);
  redrawRoute(route);
  drawCells(route.points);
}
```

A `route.points` element is `[x, y, cellId]` — index 2 is the cell id.
Two routes are joinable iff one of the four endpoint pairs matches
on cell id.

`addConnection(from, to, routeId)` (lines 329-337) does:

```js
const routes = pack.cells.routes;
if (!routes[from]) routes[from] = {};
routes[from][to] = routeId;
if (!routes[to]) routes[to] = {};
routes[to][from] = routeId;
```

i.e. it writes both directions of the adjacency map.

`Routes.remove` (`src/modules/routes-generator.ts:691-708`) walks the
joined route's points and deletes any `pack.cells.routes[from][to]`
entries whose value matches the joined route's id (and the reverse).
**It only deletes connections still tagged with the joined route's
id.** Therefore, after we re-add connections for the merged path under
the surviving route's id, calling `Routes.remove(joinedRoute)` will
NOT scrub any of the just-added connections (those carry the surviving
route's id, not the joined route's). So the legacy ordering is
correct: add new connections first, then call `Routes.remove`.

We will preserve that exact ordering. We will replicate
`addConnection` inline as a private helper inside the tool — it lives
in the editor closure and isn't exported.

We already have `add_route`, `remove_route`, `rename_route`,
`set_route_group`, `set_route_lock`, `regenerate_route_name`,
`list_routes`, `find_routes_by_group`, `get_route_info`, and
`get_route_distribution`. This plan adds the missing **merge two
routes** action.

## Lint baseline

`npm run lint 2>&1 | tail -50`:

```
> fantasy-map-generator@1.114.1 lint
> biome check --write

Checked 813 files in 653ms. No fixes applied.
```

Clean baseline.

## Behavior

1. Validate both `route` and `other` are non-negative integer ids
   (route ids start at 0, so `>= 0`).
2. Reject when `route === other` — same id passed twice.
3. Resolve both via the runtime's `find(id)` — must return the live
   `RawRoute` object (or null). Removed routes return null.
4. Determine which of the four endpoint cases applies:
   - `tail-head`: `route.points.at(-1)[2] === other.points.at(0)[2]`
   - `head-tail`: `route.points.at(0)[2] === other.points.at(-1)[2]`
   - `head-head`: `route.points.at(0)[2] === other.points.at(0)[2]`
   - `tail-tail`: `route.points.at(-1)[2] === other.points.at(-1)[2]`
5. If no case matches → return error. (Legacy is a silent no-op; we
   diverge intentionally because the AI deserves a clear failure
   mode.)
6. Compute the merged points array per the legacy logic. Mutate
   `route.points` in place to the merged array (preserves identity).
7. For every adjacent pair `(from, to)` in the merged points, call
   the inline `addConnection(from, to, route.i)` helper to update
   `pack.cells.routes` bidirectionally. This rebuilds the surviving
   route's adjacency entries (a no-op for pairs that were already
   correct, and a real add for the freshly-joined pairs).
8. Call `Routes.remove(joinedRoute)`. This:
   - removes adjacency entries still tagged with the joined route's
     id (note: any pair we just rewrote to `route.i` is safe — see
     analysis above), and
   - filters the joined route out of `pack.routes`, and
   - removes the `#route{id}` SVG element.
9. Best-effort: if `globalThis.redrawRoute` is a function, call it.
   Skip `drawControlPoints` / `drawCells` — they're editor-internal.
10. Return summary including `merge_case`.

## Inputs (JSON schema)

```jsonc
{
  "type": "object",
  "properties": {
    "route": {
      "type": "integer",
      "minimum": 0,
      "description": "Route id (the SURVIVING route — its points are extended)."
    },
    "other": {
      "type": "integer",
      "minimum": 0,
      "description": "Route id (the JOINED route — its points are merged in and the route is removed)."
    }
  },
  "required": ["route", "other"]
}
```

## Validation

- Both required.
- Both must be integers, `>= 0`.
- Both must resolve to existing non-removed routes.
- `route` and `other` must be different ids.
- Routes must share at least one endpoint cell (one of the four
  cases).
- `pack.routes` must be available.
- `pack.cells.routes` must be available (an object/record we can
  mutate).
- `Routes.remove` must be a function.

## Errors (verbatim)

- `"route must be a non-negative integer id."`
- `"other must be a non-negative integer id."`
- `"route and other must be different route ids."`
- `"Route ${id} not found."` (one for each ref — using the actual id)
- `"Routes ${a} and ${b} do not share an endpoint cell. Cannot join."`
- `"window.pack.routes is not available; the map hasn't finished loading."`
- `"window.pack.cells.routes is not available; the map hasn't finished loading."`
- `"Routes.remove is not available; the map hasn't finished loading."`
- Runtime errors propagated as their `.message`.

## Success result

```jsonc
{
  "ok": true,
  "route": {
    "i": 5,
    "name": "Coast Road",
    "previous_point_count": 8,
    "point_count": 14
  },
  "joined_route": {
    "i": 12,
    "name": "Mountain Pass",
    "removed": true
  },
  "merge_case": "tail-head"
}
```

`merge_case` is one of `"tail-head"`, `"head-tail"`, `"head-head"`,
`"tail-tail"`. `previous_point_count` is the surviving route's point
count BEFORE the join; `point_count` is after. By dedup of the shared
endpoint, `point_count === previous_point_count + other.points.length - 1`.

## Files

### NEW

- `src/ai/tools/join-routes.ts` — the tool.
- `src/ai/tools/join-routes.test.ts` — Vitest suite.

### MODIFY

- `src/ai/index.ts` — import (alphabetically — insert under `j`,
  between `invertMarkerPinsTool` and `listBiomesTool`), re-export,
  and `registry.register(joinRoutesTool)` near the other route
  tools.

## Tests (Vitest)

Stub-runtime tests:

1. happy path **tail-head**: `route` ends at cell X; `other` starts
   at X. Merged points = `[...route.points, ...other.points.slice(1)]`.
   `merge_case === "tail-head"`. `point_count` = old + other - 1.
2. happy path **head-tail**: `route` starts at X; `other` ends at X.
   Merged = `[...other.points, ...route.points.slice(1)]`.
   `merge_case === "head-tail"`.
3. happy path **head-head**: both start at X. Merged =
   `[...route.points.reverse(), ...other.points.slice(1)]`.
   `merge_case === "head-head"`. Verify route is reversed in the
   merged sequence.
4. happy path **tail-tail**: both end at X. Merged =
   `[...route.points, ...other.points.reverse().slice(1)]`.
   `merge_case === "tail-tail"`. Verify joined is reversed in the
   merged sequence.
5. same id (`route === other`) → error
   `"route and other must be different route ids."`.
6. `route` not found → error `"Route 999 not found."`.
7. `other` not found → error `"Route 999 not found."`.
8. surviving route is `removed: true` → find returns null → error.
9. joined route is `removed: true` → find returns null → error.
10. no shared endpoint → error
    `"Routes ${a} and ${b} do not share an endpoint cell. Cannot join."`
    (NOT a silent no-op).
11. `point_count` math: `previous + other - 1`.
12. `merge_case` matches the case applied (covered by 1–4).
13. `route` not an integer → error `"route must be a non-negative integer id."`.
14. `other` not an integer → error `"other must be a non-negative integer id."`.
15. negative `route` → same error as 13.
16. negative `other` → same error as 14.
17. surviving route object identity preserved — the runtime's `find`
    returns the SAME object reference before and after; the test
    captures the original reference and asserts that
    `pack.routes[idx]` still IS that reference after the call.
18. tool name and required-schema fields.
19. registry round-trip.

Default-runtime integration tests (with `globalThis.pack` and
`globalThis.Routes`):

20. tail-head end-to-end: populated pack with cells.routes; assert
    after the call:
    - merged points are correct,
    - `pack.cells.routes` has the new connections in BOTH directions
      (`routes[a][b] === route.i` AND `routes[b][a] === route.i`),
    - `pack.routes` no longer contains the joined route,
    - the surviving route's `i` is unchanged.
21. Existing `pack.cells.routes` connections that pointed to the
    joined route's id are gone after the call (verifies that
    `Routes.remove`'s scrub ran AND didn't accidentally delete the
    just-added connections under `route.i`).
22. missing `pack.routes` → error.
23. missing `pack.cells.routes` → error.
24. missing `Routes.remove` (Routes undefined) → error.
25. `Routes.remove` not a function → error.
26. `Routes.remove` is called exactly once with the joined route
    object reference (verify args).
27. integration: head-head — verify reversal applied correctly to
    the surviving route's points (concrete coordinates).
28. integration: tail-tail — verify reversal applied correctly to
    the joined route's points (concrete coordinates).

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

All must pass.

## Self-review

After drafting `tasks_354.md`, I re-read both files with the
following checklist:

- [x] All four merge cases (`tail-head`, `head-tail`, `head-head`,
      `tail-tail`) are tested with concrete points showing direction
      and the resulting `merge_case` field — see tests 1–4 (stub) and
      tests 20, 27, 28 (integration).
- [x] "No shared endpoint" errors (test 10) rather than silently
      no-op'ing — diverges from legacy behaviour intentionally.
      Documented in plan §Behavior step 5.
- [x] `merge_case` in the result matches the case actually applied —
      asserted directly in tests 1–4.
- [x] `addConnection`-equivalent updates `pack.cells.routes` in BOTH
      directions: `routes[a][b]` AND `routes[b][a]`. Verified in
      test 20.
- [x] Order: add-connections-then-Routes.remove preserved — verified
      because if the order were swapped, `Routes.remove` would still
      delete adjacency entries tagged with `joinedRoute.i`, and our
      re-add would still write under `route.i`. The current
      ordering is the safe one because once `pack.routes` no longer
      contains the joined route, `Routes.remove`'s search logic is
      irrelevant; rewriting the cells.routes map first means we
      *never* see a state where adjacency points at the
      no-longer-existing joined route id. Test 21 exercises this.
- [x] Surviving route's object identity preserved — test 17 asserts
      `pack.routes` still contains the original reference (no
      replacement, just `.points = newArr`). This is important
      because legacy code holds references to `route` between
      `getRoute()` calls.
- [x] `Routes.remove` called exactly once with the joined route's
      live object — test 26.
- [x] All eight error strings under "Errors (verbatim)" are exercised
      by at least one test.

### Corrections made during review

- Initially considered scrubbing the joined route's connections
  *before* re-adding the new ones. Removed: `Routes.remove` already
  handles that, and removing twice would just be wasteful. Documented
  the safe-ordering analysis in plan §Use case.
- Originally drafted error message variants (e.g.
  `"Route ${id} not found"` without trailing period). Aligned with
  existing tools' convention (period terminator, "is not available;
  the map hasn't finished loading."). Confirmed by re-reading
  `remove-route.ts` and `rename-route.ts`.
- Initially planned to use `parseEntityRef` from `_shared`. Rejected
  because that helper requires `> 0` (route ids start at 0). Will
  inline a `parseRouteId` validator like
  `regenerate-route-name.ts` does — but stricter (this tool only
  accepts numeric ids, no name strings, since matching by name when
  joining gets ambiguous fast).
