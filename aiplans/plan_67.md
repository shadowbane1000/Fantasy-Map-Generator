# Plan 67 — rename_route AI tool

## Use case

The Routes Editor (`public/modules/ui/routes-editor.js:339
changeName`) writes `route.name = value`. Routes carry user-visible
names in the Routes Overview and Notes. Users rename routes
narratively — "The King's Road", "Silk Trail", "Iron Passage" —
after noting their shape / endpoints.

The chat has `list_routes` (reads name) but no rename. Every other
rename-able pack entity already has a tool.

## Scope

Add one tool: `rename_route(route, name)`.

Routes use non-contiguous ids (merges/removals leave gaps) and
mark retired entries with `.removed`, same as rivers. So we need
`findRouteByRef` — mirror the `findRiverByRef` pattern:

- Numeric ref: match `route.i === ref`, skip removed.
- String ref: trim+lowercase, match `route.name?.toLowerCase()`
  among non-removed routes.

Writes `route.name = name`. No SVG redraw needed — the name lives
in the overview / notes, not on the map.

## Implementation

1. **New file `src/ai/tools/rename-route.ts`**:
   - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
     type `RawRoute`.
   - Export `findRouteByRef` — same shape as `findRiverByRef`.
   - `RouteRenameRef { i, name }`.
   - `RouteRenameRuntime { find, rename }`.
   - `defaultRouteRenameRuntime.find`: `findRouteByRef(getPack()?.routes, ref)`.
   - `defaultRouteRenameRuntime.rename(i, name)`: find by i; throw
     if missing; write `route.name = name`.
   - Tool schema: `route` (int|string required), `name` (string
     required non-empty).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/rename-route.test.ts`**:
   - Runtime-injected: rename by id; rename by name; trim; reject
     unknown; reject invalid refs; reject invalid name; surface
     failures.
   - `findRouteByRef` unit tests: null → null; match by id
     (non-contiguous); skip removed; case-insensitive name + trim;
     invalid refs.
   - Default-runtime integration: stub
     `globalThis.pack.routes`; rename by id + name; refuse rename
     of removed.

4. **README_AI.md** — new row near `list_routes`.

## Verification

- `npm test -- --run src/ai/tools/rename-route` green.
- `npm test -- --run` — 824 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "rename route 5 to The King's Road" and
  `pack.routes[k].name` updates.
- Removed routes are skipped (consistent with rivers).
- Works for non-contiguous ids.
