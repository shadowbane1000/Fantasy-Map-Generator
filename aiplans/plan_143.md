# Plan 143 — `add_route` AI tool

## Use case

Create a new route in `pack.routes` — the same side-effect as completing the Routes Creator dialog (`public/modules/ui/routes-creator.js` → `completeCreation`). The UI builds a route from a sequence of user-clicked points; for the AI tool we accept a list of `cells` (cell ids) that define the route's path and derive the `(x, y, cellId)` point triples from each cell's pack-point (`pack.cells.p[cellId]`).

## Route shape (confirmed)

From `public/modules/ui/routes-creator.js:96` (`completeCreation`) and `src/modules/routes-generator.ts:177` (`Route` interface):

```ts
// src/modules/routes-generator.ts
export interface Route {
  i: number;
  group: "roads" | "trails" | "searoutes";
  feature: number;
  points: number[][];   // Array of [x, y, cellId] triples
  cells?: number[];
  merged?: boolean;
}
```

```js
// public/modules/ui/routes-creator.js completeCreation
const routeId = Routes.getNextId();
const group = byId("routeCreatorGroupSelect").value;
const feature = pack.cells.f[points[0][2]];
const route = {points, group, feature, i: routeId};
pack.routes.push(route);

// then update pack.cells.routes adjacency:
const links = pack.cells.routes;
for (let i = 0; i < points.length; i++) {
  const point = points[i];
  const nextPoint = points[i + 1];
  if (nextPoint) {
    const cellId = point[2];
    const nextId = nextPoint[2];
    if (!links[cellId]) links[cellId] = {};
    links[cellId][nextId] = routeId;
    if (!links[nextId]) links[nextId] = {};
    links[nextId][cellId] = routeId;
  }
}
```

This matches `RawRoute` in `src/ai/tools/_shared/pack-types.ts:163`:

```ts
export interface RawRoute {
  i: number;
  group?: string;
  name?: string;
  length?: number;
  feature?: number;
  points?: unknown[];
  cells?: unknown[];
  merged?: boolean;
  lock?: boolean;
  removed?: boolean;
}
```

### Fields to write on the new route

- `i` — derived via `Routes.getNextId()` which returns `pack.routes.length ? Math.max(...pack.routes.map(r => r.i)) + 1 : 0`. Tolerates tombstoned / gapped ids. Runtime delegates to `Routes.getNextId()` when available and falls back to the same computation otherwise.
- `group` — required input, one of the three canonical group keys `"roads" | "trails" | "searoutes"` (with the same alias resolver `list-routes.ts` / `set-route-group.ts` uses: "road"→roads, "trail"→trails, "sea lanes"→searoutes, etc.).
- `feature` — optional input. When not provided we default to `pack.cells.f[cells[0]]` — mirroring `routes-creator.js` which derives the feature from the first point's cell. (Sea routes → ocean feature id, land routes → landmass feature id.)
- `points` — derived from `cells`: for each `cellId` we produce `[pack.cells.p[cellId][0], pack.cells.p[cellId][1], cellId]`. This mirrors `onClick`'s `point = [rn(x,2), rn(y,2), cellId]` but uses the cell centroid instead of the click coords.
- `name` — optional. Not auto-generated at create time (the UI leaves name undefined until the user types one). If caller provides `name`, we trim and write it; else omitted.
- `lock` — not included (the UI doesn't set it; matches existing `remove_route` / `set_route_lock` semantics which check `route.lock` truthiness).

### `pack.cells.routes` adjacency map

The route-creator also wires adjacency — each pair of consecutive cells gets a bidirectional entry in `pack.cells.routes[from][to] = routeId`. We replicate this. Without it, `Routes.isConnected`, `areConnected`, `getRoute`, and `hasRoad` won't see the new route.

## Tool contract

Inputs:
- `cells` (`number[]`, required) — ordered cell ids forming the route. At least 2 entries.
- `group` (string, required) — canonical `roads` / `trails` / `searoutes`, or a known alias.
- `name` (string, optional) — trimmed before write.
- `feature` (number, optional) — override for `route.feature`. Non-negative integer. Defaults to `pack.cells.f[cells[0]]` when available.

Outputs:
```
{
  ok: true,
  i: number,
  group: "roads" | "trails" | "searoutes",
  feature: number,
  cells: number[],
  points: [number, number, number][],
  name?: string
}
```

## Validation / rejection rules

- `cells` missing / not an array → error.
- `cells.length < 2` → error ("must include at least 2 cell indices forming the route's path").
- Each cell must be `Number.isInteger(v) && v >= 0` → otherwise error.
- Duplicate cells in the list (`cells[i] === cells[i+1]` or any `Set` collision) → error. Matches the UI's adjacency-map construction which silently skips a stationary step but would otherwise duplicate edges.
- Out-of-bounds cells (`cellId >= pack.cells.i.length`) → error with the offending id.
- `group` missing / non-string / empty trim → error with the supported list.
- `group` not resolvable by `resolveRouteGroup` → error with the supported list.
- `name`, if provided: non-string or empty-after-trim → error.
- `feature`, if provided: must be `Number.isInteger(v) && v >= 0` → otherwise error.
- Runtime: if `pack.routes` is missing (not an array) → error.

## Runtime-seam split (pattern match for `add-zone` / `add-marker`)

```ts
interface AddRouteInput {
  cells: number[];
  group: "roads" | "trails" | "searoutes";
  name?: string;
  feature?: number;
}

interface NewRoute {
  i: number;
  group: "roads" | "trails" | "searoutes";
  feature: number;
  cells: number[];
  points: [number, number, number][];
  name?: string;
}

interface AddRouteRuntime {
  validateCells(cells: number[]): { ok: true } | { ok: false; error: string };
  add(input: AddRouteInput): NewRoute;
}
```

- `validateCells` reads `pack.cells.i` to check upper bound. Separated so seam tests can exercise validation independently.
- `add` resolves the point coords from `pack.cells.p`, computes `i` via `Routes.getNextId()` (or fallback), assembles the route, pushes onto `pack.routes`, updates `pack.cells.routes`, then best-effort calls `drawRoutes()`.
- The tool layer does type / shape validation before calling the runtime.

## Integration test (globalThis seam)

Mimic `add-zone.test.ts`'s integration block:
- Install `globalThis.pack` with `routes: []`, `cells: { i: new Uint32Array(10), p: [...], f: [...], routes: {} }`.
- Install `globalThis.Routes` with a `getNextId` stub.
- Install `globalThis.drawRoutes` as a `vi.fn`.
- Verify:
  - Minimal call with `cells: [1, 2, 3]` + `group: "roads"` pushes a route with `i: 0`, derives `points` from `cells.p`, derives `feature` from `cells.f[1]`, and updates `pack.cells.routes` adjacency (bidirectional).
  - Second call computes `i: max + 1` when a route with `i: 5` already exists.
  - Explicit `feature` and `name` are preserved.
  - `group` aliases ("road" / "sea lanes") resolve to canonical values.
  - Out-of-bounds cell → error, no push, no redraw.
  - Duplicate cells → error, no push.
  - `cells.length < 2` → error.
  - Missing `pack.routes` → error.
  - `drawRoutes` throwing is swallowed.

Use `as unknown as { ... }` casts when reassigning `globalThis` slots.

## Files touched

- `src/ai/tools/add-route.ts` (new)
- `src/ai/tools/add-route.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near the other `add_*` / route tools
