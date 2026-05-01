# Tasks 288: `list_route_groups` AI chat tool

1. Read sibling tools to confirm the runtime-injection pattern:
   - `src/ai/tools/add-route-group.ts`
   - `src/ai/tools/remove-route-group.ts`
   - `src/ai/tools/list-routes.ts`
   - `src/ai/tools/list-style-presets.ts` (closest no-input list tool)
   - `src/ai/tools/_shared/results.ts` and `globals.ts` for helpers.

2. Create `src/ai/tools/list-route-groups.ts`:
   - Re-export local constant `DEFAULT_ROUTE_GROUPS = ["roads",
     "trails", "searoutes"] as const` (mirrors the UI literal).
   - Define `RouteGroupSummary { id, route_count, is_default }` and
     `ListRouteGroupsRuntime { readGroupElements, readPackRoutes }`.
   - Implement `defaultListRouteGroupsRuntime` per the plan:
     `readGroupElements` prefers `window.routes.selectAll("g")._groups[0]`
     (legacy D3 path used by the UI), falls back to
     `document.getElementById("routes")` and walks direct `<g>` children.
     Returns `null` when nothing resolves.
     `readPackRoutes` returns `pack.routes` when it is an array.
   - Export `createListRouteGroupsTool(runtime?)` returning a `Tool`
     with name `list_route_groups`, an empty `properties` schema, and
     an `execute` that:
       a. Calls `runtime.readGroupElements()`. If `null`, return
          `errorResult("Routes layer is unavailable; ...")`.
       b. Calls `runtime.readPackRoutes()`. If non-null, build a
          per-group count map keyed by `route.group` filtering
          `!removed`. Otherwise `null`.
       c. For each `<g>` element, in order, build a
          `RouteGroupSummary`. Use the per-group count from
          `pack.routes` when available; otherwise fall back to the
          SVG `childCount`. Compute `is_default` from
          `DEFAULT_ROUTE_GROUPS`.
       d. Return `okResult({ count, groups })`.
   - Export `listRouteGroupsTool = createListRouteGroupsTool()`.

3. Create `src/ai/tools/list-route-groups.test.ts`:
   - Tool-level tests with a fake runtime covering: happy path with 3
     groups (default with routes / default with zero routes / custom
     non-default), `removed: true` skipped, pack-routes fallback when
     `readPackRoutes` returns `null`, missing-layer error, empty-list
     happy path, no-input acceptance, tool metadata, factory
     equivalence, registry round-trip.
   - Integration tests for `defaultListRouteGroupsRuntime` patching
     `globalThis.routes`, `globalThis.pack`, and `globalThis.document`
     to verify the live SVG / pack reads, the document.getElementById
     fallback, and the missing-layer error path.

4. Wire into `src/ai/index.ts`:
   - Add `import { listRouteGroupsTool } from "./tools/list-route-groups";`
     in the alphabetical `listX` block (between `list-rivers` and
     `list-routes` — `list-route-groups` sorts before `list-routes` /
     after `list-rivers`).
   - Add a barrel `export { ... } from "./tools/list-route-groups";`
     adjacent to the existing `list-routes` re-export.
   - Add `registry.register(listRouteGroupsTool);` adjacent to the
     other route-group tool registrations (immediately above
     `addRouteGroupTool` registration is fine, mirroring how the
     route-group tools cluster together).

5. Run `npm test` from the worktree root. All tests must pass.

6. Run `npx tsc --noEmit` from the worktree root. Must be clean.

7. Run `npm run lint`. Must show the same baseline counts as recorded
   in `aiplans/plan_288.md` (0 errors, 7 warnings, 1 info). If the
   counts changed, fix the offending file before committing.

8. Commit on the branch with message
   `feat(ai): add list_route_groups tool` (matches the `feat(ai): add
   <tool> tool` cadence used by recent merges). Stage only:
   - `src/ai/tools/list-route-groups.ts`
   - `src/ai/tools/list-route-groups.test.ts`
   - `src/ai/index.ts`
   - `aiplans/plan_288.md`
   - `aiplans/tasks_288.md`

   Do NOT include `.claude/`, `current-ralph-loop.prompt`, or
   `src/ai/chat-controller.ts` (intentionally dirty on master). Do NOT
   push.
