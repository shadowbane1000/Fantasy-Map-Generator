# Tasks — Plan 197 (`find_nearest_marker`)

1. Baseline: `npm run lint` = 7 warnings / 1 info / 0 errors;
   `npm test` = 2877 passing.

2. Write `src/ai/tools/find-nearest-marker.ts`:
   - Imports: `errorResult`, `getPack`, `okResult`, type `RawMarker`
     from `./_shared`; types `Tool`, `ToolResult` from `./index`.
   - `FindNearestMarkerHit` interface (`i`, `type`, `icon`, `x`, `y`,
     `distance`).
   - `FindNearestMarkerQuery` union (coords / cell) carrying `type:
     string | null` through to the scanner.
   - `FindNearestMarkerOutcome = FindNearestMarkerHit | {
       i: null; type: null; icon: null; x: null; y: null; distance: null }`.
   - `FindNearestMarkerResult = FindNearestMarkerOutcome | "not-ready"
       | "out-of-bounds" | "no-cell-point"`.
   - `PackLike` shape with `markers?: RawMarker[]` and `cells?: { i?:
       ArrayLike<number>; p?: ArrayLike<[number, number] | undefined> }`.
   - `resolveQueryPoint(pack, query)` helper — returns
     `[number, number] | "out-of-bounds" | "no-cell-point"`.
   - `findNearestMarkerInPack(pack, query)`:
     - `"not-ready"` when `pack?.markers` missing.
     - Resolve query point via helper.
     - Scan `pack.markers`: skip null entries, skip `removed`, skip
       entries whose `type` doesn't match the (lower-cased) filter
       when set (markers with no `type` never match a non-null
       filter). Use `Math.sqrt(dx*dx + dy*dy)`. Track min.
     - Return the hit object or the all-null "no match" object.
   - `FindNearestMarkerRuntime` + `defaultFindNearestMarkerRuntime`
     using `getPack<PackLike>()`.
   - `parseInput(rawInput)` helper:
     - Reject neither / both (x,y) vs cell.
     - Reject partial x / y.
     - Validate `cell` non-negative integer.
     - Validate `x` / `y` finite numbers.
     - Validate optional `type` is a non-empty string, lower-case it
       for comparison; normalize absent / null to `null`.
     - Return `{ query }` or `{ error }`.
   - `createFindNearestMarkerTool(runtime)` → Tool:
     - name `find_nearest_marker`.
     - schema with `x`, `y`, `cell`, `type` (no top-level
       `required`; runtime enforces the oneOf).
     - `"not-ready"` → "Map is not ready…" message.
     - `"out-of-bounds"` → `cell <N> is out of bounds.`
     - `"no-cell-point"` → `cell <N> has no coordinates.`
     - ok path → `okResult({ ...result })`.
   - `findNearestMarkerTool = createFindNearestMarkerTool()` default
     export.

3. Write `src/ai/tools/find-nearest-marker.test.ts`:
   - Import from `./find-nearest-marker` including types + default
     runtime.
   - `asPack()` uses `as unknown as Parameters<typeof ...>[0]`.
   - `makePack()` fixture with markers of mixed types (castle,
     battlefield), including a `removed: true` entry, plus
     `cells.i` / `cells.p` so cell-form queries work.
   - `runtimeReturning(result)` helper to stub the runtime.
   - suite "pure / seam":
     - coord query returns closest active marker.
     - cell query resolves `pack.cells.p[cell]` then returns closest.
     - skips removed markers.
     - filters by `type` (case-insensitive).
     - type filter excludes markers with undefined `type`.
     - ties broken deterministically by iteration order.
     - Euclidean distance computed correctly.
     - returns `{ i: null, ... }` when no active markers.
     - returns `{ i: null, ... }` when type filter excludes all.
     - `"not-ready"` when `pack.markers` missing.
     - `"out-of-bounds"` when `cell >= cells.i.length`.
     - `"no-cell-point"` when `cells.p[cell]` is undefined.
   - suite "tool surface":
     - rejects both / neither / partial inputs.
     - rejects non-finite x / y.
     - rejects non-integer / negative cell.
     - rejects empty-string / non-string type.
     - surfaces `not-ready` / `out-of-bounds` / `no-cell-point`
       structured errors (runtime stubs).
     - returns `ok: true, i: null, ...` when no match.
     - happy path: `{ ok: true, i, type, icon, x, y, distance }`.
     - schema spot-check (properties + no top-level required).
   - suite "defaultFindNearestMarkerRuntime (integration)":
     - set `globalThis.pack = makePack()`; coord query returns real
       marker.
     - cell-form query through default runtime.
     - `globalThis.pack = undefined` → tool returns "not ready"
       structured error.

4. Wire up in `src/ai/index.ts`:
   - import `findNearestMarkerTool` near `findNearestBurgTool`.
   - re-export public surface (`createFindNearestMarkerTool`,
     `defaultFindNearestMarkerRuntime`, `findNearestMarkerTool`,
     `findNearestMarkerInPack`, type exports) alpha-sorted in the
     `find_*` cluster (after the `findNearestBurg` export block).
   - `registry.register(findNearestMarkerTool)` near
     `registry.register(listMarkersTool)`.

5. Add README_AI.md row near `list_markers` / marker tools (after
   `list_markers` or after `find_nearest_burg`), including input,
   behavior, output shape, error cases, API-key note, and usage
   examples.

6. Verify:
   - `npm run build`
   - `npm test` (expect +N tests)
   - `npx biome check src/` (must still be 7 warnings / 1 info / 0 errors)

7. Commit selected files with
   `feat(ai): add find_nearest_marker tool` + 1-2 line body.
