# Tasks for plan 295: `remove_lake_group`

1. **Re-confirm sibling patterns**: skim
   `src/ai/tools/remove-route-group.ts` and its `.test.ts` (the direct
   route-side analogue), `src/ai/tools/set-lake-group.ts` and
   `rename-lake.ts` (for the lake-feature filtering convention), and
   `src/ai/tools/list-lake-groups.ts` (which already exports
   `DEFAULT_LAKE_GROUPS`). Note `_shared/index.ts` for available
   helpers (`getGlobal`, `getPack`, `errorResult`, `okResult`).

2. **Create `src/ai/tools/remove-lake-group.ts`** containing:
   - Import `DEFAULT_LAKE_GROUPS` from `./list-lake-groups` (do NOT
     redefine).
   - Exported `RemoveLakeGroupRuntime` interface with `groupExists`,
     `freshwaterExists`, `reassignFeaturesToFreshwater`,
     `moveChildrenAndRemoveGroup`, `removeDropdownOption`.
   - Exported `defaultRemoveLakeGroupRuntime` implementing the
     interface against `window.pack.features` and `document` /
     `<g id="lakes">`. Pack data path errors out when
     `pack.features` is missing.
   - Exported `createRemoveLakeGroupTool(runtime?)` — validates input,
     rejects defaults, runs all five runtime calls in the documented
     order, returns
     `okResult({ group, reassigned_count, svg_children_moved })`.
   - Exported `removeLakeGroupTool = createRemoveLakeGroupTool()`.

3. **Create `src/ai/tools/remove-lake-group.test.ts`** covering:
   - Tool name + schema metadata.
   - Default-list constants come from `DEFAULT_LAKE_GROUPS`.
   - Happy path on a custom group `"acidic"`: matching pack lakes get
     reassigned, `<use>` elements moved into `<g id="freshwater">`,
     custom `<g>` removed, dropdown option removed; result counts.
   - Each of the six default group ids → error; pack and SVG
     unchanged.
   - Unknown group id: `groupExists` false → error; nothing else
     called.
   - `<g id="freshwater">` missing: `freshwaterExists` false → error;
     no mutations.
   - Empty custom group: counts both `0`; SVG element still removed;
     result `ok`.
   - Lakes with `removed: true` are NOT counted in
     `reassigned_count`.
   - `<select id="lakeGroup">` cleanup happens when present; absence
     does not fail the call.
   - `pack.features` missing → error (we chose error-out — see plan).
   - Invalid input (`null`, `undefined`, numbers, empty / whitespace
     strings) → error, no runtime calls.
   - `reassignFeaturesToFreshwater` throwing → error;
     `moveChildrenAndRemoveGroup` and `removeDropdownOption` NOT
     called.
   - Trims whitespace.
   - `defaultRemoveLakeGroupRuntime` integration block: build a real
     `document`-backed SVG tree, patch `globalThis.pack`, run the
     tool, assert pack and DOM end states + dropdown cleanup.

4. **Wire into `src/ai/index.ts`**:
   - Add alphabetical import next to `removeRouteGroupTool`:
     `import { removeLakeGroupTool } from "./tools/remove-lake-group";`.
   - Add alphabetical barrel re-export block exporting
     `createRemoveLakeGroupTool`, `defaultRemoveLakeGroupRuntime`,
     `type RemoveLakeGroupRuntime`, `removeLakeGroupTool` (placed near
     `remove-route-group` re-export — alphabetical order goes
     `remove-lake-group` < `remove-marker` < ...).
   - Add `registry.register(removeLakeGroupTool)` next to the other
     lake-group tools (`setLakeGroupTool`, `listLakeGroupsTool`).

5. **Verify**: `npx tsc --noEmit`, `npm test`, `npm run lint` from the
   worktree. Lint baseline (7 warnings, 1 info) must not regress.

6. **Commit on `plan-295` branch** with message
   `feat(ai): add remove_lake_group tool`. Stage only the new
   `remove-lake-group.ts`/`.test.ts` files, the `src/ai/index.ts`
   wiring, and the `aiplans/plan_295.md` / `aiplans/tasks_295.md`
   files. Do NOT stage `.claude/`, `current-ralph-loop.prompt`, or
   `src/ai/chat-controller.ts`.

7. **Report**: surface the commit SHA, lint baseline → final, and
   confirmation that tests + tsc are clean.
