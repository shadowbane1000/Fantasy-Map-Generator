# Plan 69 — remove_route AI tool

## Use case

The Routes Editor's Remove button calls `Routes.remove(route)`
(implemented in `src/modules/routes-generator.ts:691`), which:

1. Walks `route.points` and deletes cell-adjacency entries in
   `pack.cells.routes[from][to]` / `[to][from]`.
2. Filters the route out of `pack.routes`.
3. Removes the `#route{i}` SVG element.

The chat has `list_routes` / `rename_route` / `set_route_group`
but no removal. Without delegating to `Routes.remove`, we'd have
to re-implement the cell-adjacency cleanup — which is fragile.
Best to call the generator's existing method directly.

## Scope

Add one tool: `remove_route(route)`.

- `route` required — id (non-contiguous) or case-insensitive
  current name via `findRouteByRef`.
- Runtime delegates to `globalThis.Routes.remove(route)`; throws
  if `Routes` is unavailable.
- The UI's confirm dialog is skipped (tools run non-interactively)
  — same pattern as `remove_zone`, `remove_regiment`.

## Implementation

1. **New file `src/ai/tools/remove-route.ts`**:
   - Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
     `parseEntityRef`, type `RawRoute`.
   - Reuse `findRouteByRef` from `./rename-route`.
   - `RemoveRouteRef { i, name }`.
   - `RouteRemovalRuntime { find, remove }`.
   - `defaultRouteRemovalRuntime.find`: findRouteByRef → `{ i,
     name: route.name ?? "" }`.
   - `defaultRouteRemovalRuntime.remove(id)`:
     - Get `Routes` global; throw if absent ("Routes module is
       not available yet").
     - Re-resolve via findRouteByRef; throw if null.
     - Call `Routes.remove(route)`.
   - Tool schema: `route` (int|string required).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/remove-route.test.ts`**:
   - Runtime-injected:
     - Remove by id.
     - Remove by name.
     - Error on unknown ref.
     - Reject invalid refs.
     - Surface runtime failures.
   - Default-runtime integration:
     - Stub `globalThis.pack.routes` with 3 routes + 1 removed.
     - Stub `globalThis.Routes = { remove: vi.fn() }`.
     - Apply remove id 5 → `Routes.remove` called with the matched
       route object (the raw one from pack.routes, not a copy).
     - Apply remove on removed route → error (findRouteByRef
       skips).
     - Missing Routes global → error surfaced, no mutation.

4. **README_AI.md** — row under `set_route_group`.

## Verification

- `npm test -- --run src/ai/tools/remove-route` green.
- `npm test -- --run` — 850 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can remove routes; adjacency map / pack.routes / SVG all
  cleaned up via the generator's own method.
- Consistent with other remove_* tools (skip confirm; error on
  removed-or-unknown; delegate to the module where possible).
