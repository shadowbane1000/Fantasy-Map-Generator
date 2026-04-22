# Tasks 68 — set_route_group AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-route-group.ts`:
  - Imports: `errorResult`, `getPack`, `okResult`, `parseEntityRef`,
    type `RawRoute`.
  - Reuse: `findRouteByRef` from `./rename-route`; `ROUTE_GROUPS`,
    `resolveRouteGroup` from `./list-routes`.
  - Types:
    - `RouteGroupRef { i, name, previousGroup }`.
    - `RouteGroupRuntime { find, apply }`.
  - `defaultRouteGroupRuntime.find`: `findRouteByRef` → `{ i, name:
    route.name ?? "", previousGroup: route.group ?? null }`.
  - `defaultRouteGroupRuntime.apply(id, group)`:
    - Refind by id; throw if null.
    - Write `route.group = group`.
    - If document present:
      - `groupEl = document.getElementById(group)`.
      - `routeEl = document.getElementById("route" + id)`.
      - If both present: `groupEl.appendChild(routeEl)`.
  - Tool schema: `route` (int|string required), `group` (string).
  - Execute: parseEntityRef(route); validate group is non-empty
    string and resolves via resolveRouteGroup; find → 404;
    try apply; return `{ i, name, previousGroup, group }`.

## Task 2 — Register

- [ ] Import + barrel re-export + register in `src/ai/index.ts`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-route-group.test.ts`:
  - Runtime-injected:
    - Sets canonical group by id.
    - Sets by name.
    - Alias resolution ("road" → "roads", "sea lanes" → "searoutes").
    - Rejects unknown group strings.
    - Rejects invalid route ref.
    - Rejects non-string group.
    - Error on unknown route.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.pack.routes` with `[{i:1,name:"Silk Trail",
      group:"roads"},{i:5,name:"Iron",group:"roads"},{i:9,name:
      "retired",removed:true,group:"trails"}]`.
    - Stub `globalThis.document`: `#route5` element, `#searoutes`
      parent with appendChild spy.
    - Apply group "searoutes" for route 5 → `route.group =
      "searoutes"`, appendChild called with routeEl.
    - Alias "sea lanes" still sets canonical "searoutes".
    - Missing group parent → data still updated.
    - Removed route → error.

## Task 4 — README

- [ ] Row under `rename_route`:
  ```
  | `set_route_group`       | Reclassify a route between road / trail / searoute (same as the Routes Editor group dropdown). Writes `route.group` and reparents the `#route{i}` SVG path under the new group element. Accepts canonical values and common aliases ("road"/"trail"/"sea lanes"/etc.). Matches route by id or case-insensitive current name; removed routes are skipped. | "Move route 5 to searoutes", "Turn the coastal trail into a sea lane" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-route-group` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_route_group tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Routes Editor group dropdown.
- Plan writes the same `route.group` and reparents the SVG under
  the same `<g>` the UI uses. The Layers / Routes Overview read
  from `route.group` for filtering, so the change is observable
  everywhere.
- Alias resolution matches the existing `list_routes` filter so
  the AI can use natural phrases.

## Verification that tests prove the use case

- Integration test asserts both side-effects (data write + SVG
  reparent).
- Alias test ensures canonicalisation matches list_routes'
  existing behaviour.
- Missing-element soft fail tested so the tool doesn't break on
  half-loaded maps.
