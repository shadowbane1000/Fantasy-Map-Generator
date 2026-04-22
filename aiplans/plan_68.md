# Plan 68 — set_route_group AI tool

## Use case

The Routes Editor's group dropdown (`changeGroup` at
`public/modules/ui/routes-editor.js:343`) moves a route between
`roads`, `trails`, and `searoutes` — it reparents the SVG path to
the corresponding `<g>` element and writes `route.group = group`.
Users reclassify routes (e.g. a coastal trail is really a small
sea lane).

`rename_route` (plan 67) is in, but the group is the other
primary knob the editor exposes. The existing tool
`resolveRouteGroup` (exported from `list-routes.ts`) already
accepts the canonical values plus common aliases (road / trail /
sea lanes), so this tool can reuse it.

## Scope

Add one tool: `set_route_group(route, group)`.

- `route` required — numeric id (non-contiguous, skip removed) or
  case-insensitive current name (via `findRouteByRef`).
- `group` required — one of `roads`, `trails`, `searoutes`
  (case-insensitive + aliases via `resolveRouteGroup`).

Side-effects matching `changeGroup`:
1. Write `route.group = group` (canonical form).
2. If `document` present: move `#route{i}` under
   `#{group}` parent. Soft-fail if either element is missing.

## Implementation

1. **New file `src/ai/tools/set-route-group.ts`**:
   - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
     type `RawRoute`.
   - Reuse `findRouteByRef` from `./rename-route`; `ROUTE_GROUPS`,
     `resolveRouteGroup` from `./list-routes`.
   - `RouteGroupRef { i, name, previousGroup }`.
   - `RouteGroupRuntime { find, apply }`.
   - `defaultRouteGroupRuntime.find`: findRouteByRef →
     `{ i, name, previousGroup: route.group ?? null }`.
   - `defaultRouteGroupRuntime.apply(id, group)`:
     - Refind by id; throw if missing.
     - Write `route.group = group`.
     - If `document`:
       `groupEl = document.getElementById(group)`.
       `routeEl = document.getElementById(\`route${id}\`)`.
       If both exist: `groupEl.appendChild(routeEl)`.
   - Tool schema: `route` (int|string required), `group` (string
     required).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-route-group.test.ts`**:
   - Runtime-injected:
     - Sets by id with canonical group.
     - Sets by name.
     - Canonicalizes aliases (e.g. "road" → "roads", "sea lanes"
       → "searoutes").
     - Rejects unknown group strings.
     - Reject invalid route refs.
     - Error when route unknown.
     - Surface runtime failures.
   - Default-runtime integration:
     - Stub `globalThis.pack.routes` with 3 routes.
     - Stub document with fake `#route5` element + fake
       `#searoutes` parent exposing `appendChild` spy.
     - Apply group "searoutes" → route.group = "searoutes",
       parent.appendChild called with the route element.
     - Alias "sea lanes" accepted.
     - If parent element missing → still succeeds, data updated.
     - Route is removed → error.

4. **README_AI.md** — row under `rename_route`.

## Verification

- `npm test -- --run src/ai/tools/set-route-group` green.
- `npm test -- --run` — 838 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can move routes between groups.
- Aliases accepted.
- DOM reparenting matches UI behaviour; data stays in sync.
