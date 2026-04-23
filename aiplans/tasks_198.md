# Tasks — Plan 198 (`find_nearest_river`)

1. Baseline: `npm run lint` = 7 warnings / 1 info / 0 errors;
   `npm test` = 2927 passing.

2. Write `src/ai/tools/find-nearest-river.ts`:
   - Imports: `errorResult`, `getPack`, `okResult`, type `RawRiver`
     from `./_shared`; types `Tool`, `ToolResult` from `./index`.
   - `FindNearestRiverHit` interface (`i`, `name`, `x`, `y`,
     `distance`).
   - `FindNearestRiverQuery` union (coords / cell).
   - `FindNearestRiverOutcome = FindNearestRiverHit | {
       i: null; name: null; x: null; y: null; distance: null }`.
   - `FindNearestRiverResult = FindNearestRiverOutcome | "not-ready"
       | "out-of-bounds" | "no-cell-point"`.
   - `PackLike` shape with `rivers?: RawRiver[]` and `cells?: { i?:
       ArrayLike<number>; p?: ArrayLike<[number, number] | undefined> }`.
   - `resolveQueryPoint(pack, query)` helper — returns
     `[number, number] | "out-of-bounds" | "no-cell-point"`
     (mirrors the burg / marker version).
   - `findNearestRiverInPack(pack, query)`:
     - `"not-ready"` when `pack?.rivers` missing.
     - Resolve query point via helper.
     - Scan `pack.rivers`: skip null entries, skip `removed`, skip
       `i === 0` placeholder.
     - For each river, read `pack.cells.p[source]` / `pack.cells.p[mouth]`
       when those fields are numbers. Compute
       `Math.sqrt(dx*dx + dy*dy)` for whichever endpoint(s) have
       valid coords; take the min. Skip rivers that have no usable
       endpoint.
     - Track best river + best endpoint coords + min distance.
     - Return the hit object (with the winning endpoint's coords as
       `x` / `y`) or the all-null "no match" object.
   - `FindNearestRiverRuntime` + `defaultFindNearestRiverRuntime`
     using `getPack<PackLike>()`.
   - `parseInput(rawInput)` helper:
     - Reject neither / both (x,y) vs cell.
     - Reject partial x / y.
     - Validate `cell` non-negative integer.
     - Validate `x` / `y` finite numbers.
     - Return `{ query }` or `{ error }`.
   - `createFindNearestRiverTool(runtime)` → Tool:
     - name `find_nearest_river`.
     - schema with `x`, `y`, `cell` (no top-level `required`;
       runtime enforces the oneOf).
     - `"not-ready"` → "Map is not ready…" message.
     - `"out-of-bounds"` → `cell <N> is out of bounds.`
     - `"no-cell-point"` → `cell <N> has no coordinates.`
     - ok path → `okResult({ ...result })`.
   - `findNearestRiverTool = createFindNearestRiverTool()` default
     export.

3. Write `src/ai/tools/find-nearest-river.test.ts`:
   - Import from `./find-nearest-river` including types + default
     runtime.
   - `asPack()` uses `as unknown as Parameters<typeof ...>[0]`.
   - `makePack()` fixture with a handful of rivers (varying source /
     mouth cells), including a `removed: true` entry, plus
     `cells.i` / `cells.p` so cell-form queries work and source /
     mouth can be mapped to coords.
   - `runtimeReturning(result)` helper to stub the runtime.
   - suite "pure / seam":
     - coord query returns closest active river (via source).
     - coord query returns closest active river (via mouth when
       mouth is closer than source).
     - cell query resolves `pack.cells.p[cell]` then returns closest.
     - skips removed rivers.
     - skips the `i === 0` placeholder.
     - endpoint coords returned match the nearer endpoint.
     - ties broken deterministically by iteration order.
     - Euclidean distance computed correctly.
     - returns `{ i: null, ... }` when no active rivers.
     - returns `{ i: null, ... }` when every river has missing
       source / mouth.
     - `"not-ready"` when `pack.rivers` missing.
     - `"out-of-bounds"` when `cell >= cells.i.length`.
     - `"no-cell-point"` when `cells.p[cell]` is undefined.
   - suite "tool surface":
     - rejects both / neither / partial inputs.
     - rejects non-finite x / y.
     - rejects non-integer / negative cell.
     - surfaces `not-ready` / `out-of-bounds` / `no-cell-point`
       structured errors (runtime stubs).
     - returns `ok: true, i: null, ...` when no match.
     - happy path: `{ ok: true, i, name, x, y, distance }`.
     - schema spot-check (properties + no top-level required).
   - suite "defaultFindNearestRiverRuntime (integration)":
     - set `globalThis.pack = makePack()`; coord query returns real
       river.
     - cell-form query through default runtime.
     - `globalThis.pack = undefined` → tool returns "not ready"
       structured error.

4. Wire up in `src/ai/index.ts`:
   - import `findNearestRiverTool` near
     `findNearestBurgTool` / `findNearestMarkerTool`.
   - re-export public surface (`createFindNearestRiverTool`,
     `defaultFindNearestRiverRuntime`, `findNearestRiverTool`,
     `findNearestRiverInPack`, type exports) alpha-sorted in the
     `find_*` cluster (after the `findNearestMarker` export block).
   - `registry.register(findNearestRiverTool)` near
     `registry.register(listRiversTool)`.

5. Add README_AI.md row near `find_nearest_burg` /
   `find_nearest_marker` (ideally after `find_nearest_marker`),
   including input, behavior, output shape, error cases, API-key
   note, and usage examples.

6. Verify:
   - `npm run build`
   - `npm test` (expect +N tests)
   - `npx biome check src/` (must still be 7 warnings / 1 info / 0 errors)

7. Commit selected files with
   `feat(ai): add find_nearest_river tool` + 1-2 line body.
