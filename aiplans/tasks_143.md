# Tasks 143 — `add_route` AI tool

## Files

- `src/ai/tools/add-route.ts` (new) — runtime-seam tool
- `src/ai/tools/add-route.test.ts` (new) — unit + integration tests
- `src/ai/index.ts` — import / re-export / register
- `README_AI.md` — add a row describing the tool

## Implementation checklist

1. Plan/task files written.
2. Implement `src/ai/tools/add-route.ts`:
   - Import `errorResult`, `getGlobal`, `getPack`, `okResult`, `RawRoute` from `./_shared`.
   - Import `Tool`, `ToolResult` from `./index`.
   - Import `ROUTE_GROUPS`, `resolveRouteGroup`, `RouteGroup` from `./list-routes`.
   - Define `AddRouteInput`, `NewRoute`, `AddRouteRuntime` interfaces.
   - Implement `defaultAddRouteRuntime`:
     - `validateCells`: dedup-check, bounds check against `pack.cells.i.length`.
     - `add`: read `pack.cells.p` for coords, `pack.cells.f` for default feature, call `Routes.getNextId()` (with fallback), push, update `pack.cells.routes`, best-effort `drawRoutes()`.
   - `createAddRouteTool(runtime)` with input validation:
     - `cells`: array, ≥2 entries, ints, no duplicates (both consecutive and anywhere).
     - `group`: non-empty string, resolved via `resolveRouteGroup`.
     - `name`: optional, trimmed, non-empty.
     - `feature`: optional, integer ≥ 0.
   - Export `addRouteTool = createAddRouteTool()`.
3. Implement `src/ai/tools/add-route.test.ts`:
   - Tool-layer tests: reject invalid shapes, delegate on happy paths, surface runtime errors.
   - `defaultAddRouteRuntime` integration block: install a fake pack + Routes + drawRoutes, verify mutation + adjacency + redraw.
4. Register in `src/ai/index.ts`:
   - Import `addRouteTool` near `removeRouteTool`.
   - Add re-export of `createAddRouteTool`/`addRouteTool`.
   - `registry.register(addRouteTool)` near the other route tools.
5. Add README row.
6. Verify:
   - `npm run build`.
   - `npm test -- --run` — expect +N tests, all passing.
   - `npx biome check src/` — expect same 7 warnings / 1 info / 0 errors baseline.
7. Commit with `feat(ai): add add_route tool`.
