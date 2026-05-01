# Tasks 355 — `split_route` AI chat tool

## Implementation

- [ ] Create `src/ai/tools/split-route.ts`:
  - [ ] Imports: `errorResult`, `getGlobal`, `getPack`, `okResult`,
        `RawRoute` from `./_shared`; `Tool`, `ToolResult` from
        `./index`.
  - [ ] Local `parseRouteRef(value)` (mirrors
        `regenerate-route-name.ts` — accepts integer ≥ 0 or
        non-empty string).
  - [ ] Local `findRouteIncludingRemoved(routes, ref)` — walks
        `pack.routes` matching by `i` or case-insensitive `name`,
        BUT does not skip `removed` entries. Returns the first match
        or `null`.
  - [ ] Types:
    - [ ] `SplitRouteRef` — `{ i, name, group, feature, points: [number, number, number][] }`.
    - [ ] `SplitRouteResult` — `{ newRouteId, newPointCount, oldPointCount, sharedCellId }`.
    - [ ] `SplitRouteRuntime` — `{ find(ref): SplitRouteRef | null;
          split(ref, index): SplitRouteResult }`.
  - [ ] `defaultSplitRouteRuntime`:
    - [ ] `find` — walks `pack.routes` via
          `findRouteIncludingRemoved`, returns shape with normalized
          fields and a `removed: boolean` flag. Coerces `points` to
          `[number, number, number][]`; if `feature` missing, default
          to `0`; if `group` missing, default to `""`.
    - [ ] `split(ref, index)`:
      - [ ] Re-resolve route from `pack.routes` by id (so we mutate
            the live object, not the snapshot).
      - [ ] Validate `pack.routes` is array → throw
            `"window.pack.routes is not available; the map hasn't finished loading."`.
      - [ ] Validate `pack.cells.routes` is object → throw
            `"window.pack.cells.routes is not available; the map hasn't finished loading."`.
      - [ ] Validate `Routes.getNextId` is a function → throw
            `"Routes.getNextId is not available; the map hasn't finished loading."`.
      - [ ] Compute `oldPoints = route.points.slice(0, index + 1)`,
            `newPoints = route.points.slice(index)`.
      - [ ] `route.points = oldPoints` (in-place — preserves object
            identity).
      - [ ] Build `newRoute` with `i = Routes.getNextId()`,
            `group / feature / points` from original; copy `name` only
            if defined.
      - [ ] `pack.routes.push(newRoute)`.
      - [ ] Inline `addConnection(from, to, id)` over adjacent pairs
            in `newPoints` — overwrites both directions in
            `pack.cells.routes`.
      - [ ] Best-effort: append `<path>` to legacy `routes` D3
            selection via `routes.select("#" + group).append(...)`,
            wrapped in try/catch.
      - [ ] Best-effort: call `drawRoutes()` if global, wrapped.
      - [ ] Return `SplitRouteResult`.
  - [ ] `createSplitRouteTool(runtime)`:
    - [ ] `name = "split_route"`.
    - [ ] Description: explain the split, that the split point is
          shared by both routes, and that connections downstream
          rebind to the new route id.
    - [ ] `input_schema` per plan.
    - [ ] `execute`:
      - [ ] Validate `route` via `parseRouteRef`.
      - [ ] Validate `index` is integer; if not, error
            `"index must be an integer in [1, ${maxIndex}]."`
            (synthetic maxIndex placeholder is impossible without the
            route — emit a generic
            `"index must be a non-negative integer."` first if not an
            integer at all? — Plan dispatch lists only the
            integer-in-range error; we therefore *first* resolve the
            route to compute maxIndex, then validate index against
            that range.).
      - [ ] Resolve `target = runtime.find(parsed.ref)`; if null →
            `"Route ${ref} not found."` (use JSON.stringify for ref).
      - [ ] If `target.removed === true` →
            `"Cannot split removed route ${target.i}."` and stop.
      - [ ] If `target.points.length < 3` → error
            `"index must be an integer in [1, ${maxIndex}]."` with
            `maxIndex = target.points.length - 2` (which would be
            negative; we still emit the formatted string — it's the
            spec-required text).
      - [ ] Validate `index` integer in
            `[1, target.points.length - 2]`.
      - [ ] Try `runtime.split(target, index)` — propagate errors via
            `errorResult(err.message)`.
      - [ ] Build success body:
        ```ts
        {
          ok: true,
          route: {
            i: target.i,
            ...(target.name ? { name: target.name } : {}),
            previous_point_count: target.points.length,
            point_count: oldCount,
          },
          new_route: {
            i: result.newRouteId,
            ...(target.name ? { name: target.name } : {}),
            point_count: result.newPointCount,
          },
          split_at_index: index,
        }
        ```
  - [ ] Export `splitRouteTool = createSplitRouteTool()`.

- [ ] Create `src/ai/tools/split-route.test.ts`:
  - [ ] Stub-runtime suite — 13 tests per plan.
  - [ ] Registry round-trip — register `splitRouteTool`, run via
        `ToolRegistry`, verify pack mutation.
  - [ ] Default-runtime integration suite:
    - [ ] `globalThis.pack = { routes: […], cells: { routes: {} } }`.
    - [ ] `globalThis.Routes = { getNextId: () => N }`.
    - [ ] Verify split mutates real `pack.routes`, identity preserved,
          `pack.cells.routes[from][to] = newId` for newPoints adjacent
          pairs.
    - [ ] Missing `pack.routes` / `pack.cells.routes` /
          `Routes.getNextId` cases.
  - [ ] `splitRouteTool.name === "split_route"`,
        `input_schema.required === ["route", "index"]`.

- [ ] `src/ai/index.ts`:
  - [ ] Add `import { splitRouteTool } from "./tools/split-route";`
        immediately after the `splitRegimentTool` import (alphabetical).
  - [ ] Add `export { createSplitRouteTool, splitRouteTool } from
        "./tools/split-route";` after the split-regiment block.
  - [ ] Add `registry.register(splitRouteTool);` immediately after
        `registry.register(splitRegimentTool);`.

## Verification

- [ ] `npm test` — all green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run lint` — no warnings.

## Commit

- [ ] Stage `src/ai/tools/split-route.ts`,
      `src/ai/tools/split-route.test.ts`,
      `src/ai/index.ts`,
      `aiplans/plan_355.md`,
      `aiplans/tasks_355.md`.
- [ ] Commit with the spec-required message.

## Self-review checklist (re-read before implementing)

- [ ] Plan and tasks both name file paths consistently
      (`split-route.ts`, `split-route.test.ts`).
- [ ] Tasks list all 19 tests from the plan? — answer: tests 1-13 are
      stub-runtime; 14 is registry; 15-19 are integration. Tasks file
      groups them into "stub", "registry", "integration" — same
      coverage.
- [ ] Both routes terminate at the same cell after split — covered by
      stub test 2 (identity at boundary) AND integration test 15
      (real points array).
- [ ] `pack.cells.routes` rewrite — stub test 6 + integration test 15.
- [ ] Index boundary errors — tests 7, 8, 9.
- [ ] Original route object identity preserved — test 13 (stub) +
      integration assertion.
- [ ] Errors-verbatim list matches plan and tests.
