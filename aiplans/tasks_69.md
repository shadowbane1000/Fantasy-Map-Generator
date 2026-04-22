# Tasks 69 — remove_route AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/remove-route.ts`:
  - Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
    `parseEntityRef`, type `RawRoute`.
  - Reuse `findRouteByRef` from `./rename-route`.
  - Types:
    - `RemoveRouteRef { i, name }`.
    - `RouteRemovalRuntime { find, remove }`.
    - Internal `RoutesModule { remove: (route: RawRoute) => void }`.
  - `defaultRouteRemovalRuntime.find`: `findRouteByRef` → shape.
  - `defaultRouteRemovalRuntime.remove(id)`:
    - `routesModule = getGlobal<RoutesModule>("Routes")`.
    - If `typeof routesModule?.remove !== "function"`: throw
      "Routes.remove is not available yet; wait for the map to
      finish loading."
    - Refind via `findRouteByRef(getPack<{routes?}>()?.routes, id)`.
    - Throw if null.
    - `routesModule.remove(route)`.
  - Tool schema: `route` (int|string required).
  - Execute: parseEntityRef(route); find → 404; try remove;
    return `{ i, name }`.

## Task 2 — Register

- [ ] Import + barrel re-export + register after
  `renameRouteTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/remove-route.test.ts`:
  - Runtime-injected:
    - Remove by id, response carries i/name.
    - Remove by case-insensitive name.
    - Error on unknown route.
    - Reject invalid refs.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack.routes` with a couple of non-removed
      routes + 1 `.removed`.
    - Stub `globalThis.Routes = { remove: vi.fn() }`.
    - Remove id 5 → `Routes.remove` called with the matched route
      object.
    - Remove removed route (id 9) → error; `Routes.remove` not
      called.
    - When `Routes` global is absent → error surfaced.

## Task 4 — README

- [ ] Row under `set_route_group`:
  ```
  | `remove_route`          | Delete a route — delegates to the generator's `Routes.remove()` so the cell adjacency map (`pack.cells.routes`), `pack.routes`, and the `#route{i}` SVG element are all cleaned up together. Matches by id or case-insensitive current name; skips removed routes. | "Remove route 5", "Delete the Silk Trail" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/remove-route` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add remove_route tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Routes Editor trash button removes a route.
- Plan delegates to `Routes.remove(route)` — the same function
  the UI's confirmationDialog callback calls. That handles cell
  adjacency cleanup, array filtering, and SVG removal — we don't
  need to re-implement any of that logic.
- Missing-module guard ensures the tool fails loudly on
  half-loaded maps rather than corrupting state.

## Verification that tests prove the use case

- Integration test confirms `Routes.remove` is called with the
  exact object pulled from `pack.routes` (so cell-adjacency
  cleanup has the right `route.points`).
- Removed-route lookup test ensures we don't double-remove.
- Missing-global test ensures the tool errors out cleanly.
