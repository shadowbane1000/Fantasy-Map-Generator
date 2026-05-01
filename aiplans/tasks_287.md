# Tasks for plan 287: `remove_route_group`

1. **Re-confirm sibling patterns**: skim `src/ai/tools/remove-route.ts`,
   `src/ai/tools/set-route-group.ts`, and their `.test.ts` files. Note
   the `RouteRemovalRuntime` (find/remove pair), how
   `defaultRouteRemovalRuntime.remove` looks up `window.Routes.remove`,
   and how `set-route-group.test.ts` patches `globalThis.pack` /
   `globalThis.document` for integration. Also inspect
   `_shared/index.ts` for available helpers (`getGlobal`, `getPack`,
   `errorResult`, `okResult`, `RawRoute` type).

2. **Create `src/ai/tools/remove-route-group.ts`** containing:
   - Exported `DEFAULT_ROUTE_GROUPS = ["roads", "trails", "searoutes"]
     as const`.
   - Exported `RemoveRouteGroupRuntime` interface with
     `groupExists(group)`, `listRoutesInGroup(group)`,
     `removeRoute(route)`, `removeGroupElement(group)`.
   - Exported `defaultRemoveRouteGroupRuntime` implementing the
     interface against `window.pack.routes`, `window.Routes.remove`,
     and the `routes` D3 selection (with a `document.getElementById`
     fallback for `groupExists`).
   - Exported `createRemoveRouteGroupTool(runtime?)` — validates
     `input.group` (non-empty trimmed string), calls
     `runtime.groupExists`, returns error if missing, else lists
     routes, removes each, conditionally removes the `<g>`, returns
     `okResult({ group, removed_count, svg_removed })`.
   - Exported `removeRouteGroupTool = createRemoveRouteGroupTool()`.

3. **Create `src/ai/tools/remove-route-group.test.ts`** mirroring
   `remove-route.test.ts` and `set-route-group.test.ts`, with a fake
   runtime helper. Covers:
   - Tool name + schema metadata.
   - Happy path on `"route-pilgrim"`: all matching routes passed to
     `removeRoute`, `removeGroupElement` called, result has
     `removed_count: <n>`, `svg_removed: true`.
   - Default group `"roads"`: routes removed, `removeGroupElement` NOT
     called, `svg_removed: false`. (Parameterise across all three
     defaults.)
   - Unknown group: `groupExists` returns false → error, no other
     runtime calls.
   - Empty group existing but with no routes: returns `removed_count:
     0` with svg_removed reflecting default-vs-non-default.
   - Invalid input (`null`, `undefined`, `42`, `""`, `"   "`) → error,
     no mutations.
   - `removeRoute` throwing → error surfaced.
   - Integration block (`defaultRemoveRouteGroupRuntime`) patches
     `globalThis.pack`, `globalThis.routes` (a fake D3-shaped object
     with `select(id) -> { empty(), size(), remove() }`), and
     `globalThis.Routes`. Verifies a non-default group's
     `routes.select("#g").remove()` is called and a default group's is
     not. Verifies missing `Routes.remove` produces an error.

4. **Wire into `src/ai/index.ts`**:
   - Add alphabetical import: `import { removeRouteGroupTool } from
     "./tools/remove-route-group";` (next to
     `import { removeRouteTool } from "./tools/remove-route";`).
   - Add an alphabetical barrel re-export block exporting
     `createRemoveRouteGroupTool`, `defaultRemoveRouteGroupRuntime`,
     `DEFAULT_ROUTE_GROUPS`, `type RemoveRouteGroupRuntime`, and
     `removeRouteGroupTool` (placed next to the existing
     `remove-route` re-export).
   - Add `registry.register(removeRouteGroupTool)` next to
     `registry.register(removeRouteTool)`.

5. **README_AI.md**: insert a row after `remove_route` for
   `remove_route_group` in the same prose / example-questions style.

6. **Verify**: run `npx tsc --noEmit`, `npm test`, `npm run lint` from
   the worktree. All three must be clean / non-regressing.

7. **Commit on the `plan-287` branch** with message
   `feat(ai): add remove_route_group tool`. Stage only the new
   `remove-route-group.ts`/`.test.ts` files, the `src/ai/index.ts`
   wiring, the `README_AI.md` row, and the `aiplans/plan_287.md` /
   `aiplans/tasks_287.md` files. Do NOT stage `.claude/`,
   `current-ralph-loop.prompt`, or `src/ai/chat-controller.ts`.

8. **Report**: surface the commit SHA, lint baseline → final, and
   confirmation that tests + tsc are clean.
