# Tasks — Plan 192 (`get_route_info`)

1. Study
   - [x] Read `src/ai/tools/list-routes.ts` — route summary shape & alias resolver.
   - [x] Read `src/ai/tools/add-route.ts` — route creation, point triple shape, ids start at 0.
   - [x] Read `src/ai/tools/rename-route.ts` / `set-route-group.ts` / `set-route-lock.ts` / `remove-route.ts` — shared `findRouteByRef`, field coverage.
   - [x] Read `src/ai/tools/_shared/pack-types.ts` — `RawRoute` shape.
   - [x] Read `src/ai/tools/get-river-info.ts` & `get-zone-info.ts` for pattern parity.
   - [x] Confirm baseline: `npm test` → 2789 tests; `npm run lint` → 7 warnings, 1 info, 0 errors.

2. Implement `src/ai/tools/get-route-info.ts`
   - [ ] Export `DEFAULT_POINTS_LIMIT = 5000`, `MAX_POINTS_LIMIT = 5000`.
   - [ ] Export `RouteInfo` interface: `{i, name, group, length, lock, feature, points, points_count}`.
   - [ ] Export `RouteInfoPackLike` interface referencing `routes?: RawRoute[]`.
   - [ ] Export pure `readRouteInfoFromPack(pack, ref, limit) : RouteInfo | "not-ready" | "not-found"`:
     - return `"not-ready"` if `pack?.routes` missing.
     - resolve via `findRouteByRef(pack.routes, ref)`.
     - if not found or `removed`, return `"not-found"`.
     - compute length from `route.length` or fallback to summing `hypot` across `points`.
     - truncate `points` to `limit` (clamped 0..MAX_POINTS_LIMIT).
     - map raw point triples defensively (use `[x, y, cellI]` with 0 fallbacks so malformed entries don't throw).
   - [ ] Export `RouteInfoRuntime` + `defaultRouteInfoRuntime` using `getPack<RouteInfoPackLike>()`.
   - [ ] Export `createGetRouteInfoTool(runtime = defaultRouteInfoRuntime): Tool` with:
     - `name: "get_route_info"`.
     - description listing the fields, noting route-ids-start-at-0, lazy length gotcha, limit truncation, and "Requires an Anthropic API key …".
     - `input_schema` with required `route` (int|string) and optional `limit` (int [0, 5000]).
     - `execute`: local `parseRouteRef` (rejects non-integers / negative / empty string; accepts 0), parses limit, calls runtime, converts `"not-ready"` / `"not-found"` into structured errors, else `okResult({...})`.
   - [ ] Export `getRouteInfoTool = createGetRouteInfoTool()`.

3. Implement `src/ai/tools/get-route-info.test.ts`
   - [ ] Fake pack helper producing: route 0 (roads, full fields with points/length/lock/feature), route 2 (trails, no `length` so force fallback), route 4 (searoutes with feature > 0), route 5 (removed), route 7 (minimal — name only).
   - [ ] Pure-fn block asserts: full dossier, name lookup (case-insensitive), length fallback hypotenuse math, feature echo, lock truthy, `points_count` vs truncated `points`, `not-found` on removed / unknown, `not-ready` on missing pack, bad inputs via the tool shell.
   - [ ] Integration block: sets `(globalThis as unknown as { pack?: unknown }).pack = makePack()`, reads via `defaultRouteInfoRuntime.readRouteInfo` and also through `getRouteInfoTool.execute` (not-ready when pack cleared, not-found for unknown ids, full info for real id).
   - [ ] Use `as unknown as { … }` casts as per instruction.

4. Register
   - [ ] `src/ai/index.ts`: `import { getRouteInfoTool } from "./tools/get-route-info";`
   - [ ] Add to barrel exports (type + factory + runtime + default + pack-like + pure fn).
   - [ ] `registry.register(getRouteInfoTool);` near the other `get_*_info` registrations.

5. README_AI.md
   - [ ] New row after `get_zone_info` row (or grouped with the other `get_*_info` rows) describing the tool, referencing the "Requires an Anthropic API key (see 'Getting an API key' below)." trailer.

6. Verify
   - [ ] `npm run build`.
   - [ ] `npm test` → expect +1 file, +~15 tests.
   - [ ] `npm run lint` → same 7 warnings, 1 info, 0 errors.

7. Commit
   - [ ] Stage: `src/ai/tools/get-route-info.ts`, `src/ai/tools/get-route-info.test.ts`, `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_192.md`, `aiplans/tasks_192.md`.
   - [ ] `feat(ai): add get_route_info tool` with short body.
