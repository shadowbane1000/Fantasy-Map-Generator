# Tasks — Plan 293 (`list_lake_groups`)

1. **Capture lint baseline** (already in `plan_293.md`):
   - `npm run lint 2>&1 | tail -40` → 7 warnings, 1 info, 0 errors,
     684 files checked.

2. **Write the new module** at
   `src/ai/tools/list-lake-groups.ts`, copying the structure of
   `list-route-groups.ts`:
   - Define `DEFAULT_LAKE_GROUPS = ["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"]` as `const`.
   - Define `LakeGroupSummary { id; lake_count; is_default }`.
   - Define `LakeGroupElement { id; childCount }`.
   - Define `ListLakeGroupsRuntime` interface: `readGroupElements()` and
     `readPackFeatures()`.
   - Define `MinimalElementLike`, `D3MultiSelectionLike`,
     `LakesD3SelectionLike` private interfaces.
   - Implement `readFromD3Selection()`, `readFromDom()`,
     `defaultListLakeGroupsRuntime`.
   - Implement `buildCountMap(features: unknown[])` — iterate from
     index 1, ignore non-objects, ignore non-lakes, ignore removed,
     bucket by `feature.group`.
   - Implement `createListLakeGroupsTool(runtime?)` factory + export
     default `listLakeGroupsTool`.

3. **Write tests** at `src/ai/tools/list-lake-groups.test.ts`:
   - Metadata: name, empty schema, `DEFAULT_LAKE_GROUPS` literal,
     factory equivalence, ToolRegistry round-trip.
   - Mocked-runtime tool tests (mirror route-groups suite):
     - Happy path 3 groups in SVG order.
     - SVG order preserved (non-alphabetical).
     - `removed: true` lakes excluded from count.
     - Non-lake features excluded from count.
     - Index-0 placeholder skipped.
     - Falls back to `childCount` when `readPackFeatures` returns null.
     - Empty groups list → `count: 0`.
     - Accepts `{}`, `null`, `undefined` input uniformly.
     - Errors when `readGroupElements` returns null; `readPackFeatures`
       never called (fail-fast).
     - All six defaults identified by `is_default`.
   - Integration via `defaultListLakeGroupsRuntime`:
     - Reads `<g>` nodes from `window.lakes._groups[0]` and counts
       lakes by reading `window.pack.features`.
     - Falls back to `document.getElementById("lakes")` when
       `window.lakes` absent.
     - Uses childCount fallback when `pack.features` is unavailable.
     - Errors when neither `window.lakes` nor `#lakes` element exists.
   - No-document environment block: errors when both globals are
     absent.

4. **Wire into the registry** (`src/ai/index.ts`):
   - Add `import { listLakeGroupsTool } from "./tools/list-lake-groups";`
     in alphabetical position among the `list-*` imports.
   - Add an export block (near `list-route-groups`):
     ```
     export {
       createListLakeGroupsTool,
       DEFAULT_LAKE_GROUPS,
       defaultListLakeGroupsRuntime,
       type LakeGroupElement,
       type LakeGroupSummary,
       type ListLakeGroupsRuntime,
       listLakeGroupsTool,
     } from "./tools/list-lake-groups";
     ```
   - Add `registry.register(listLakeGroupsTool);` near other lake /
     route-group registrations (e.g. right after
     `registry.register(setLakeGroupTool);`).

5. **Verification**:
   - `npm test` (Vitest) passes — all new tests + the existing suite.
   - `npx tsc --noEmit` is clean.
   - `npm run lint` does not regress vs the baseline (7/1/0 in
     warnings/info/errors, same file count).

6. **Commit**:
   - Stage only:
     - `src/ai/tools/list-lake-groups.ts`
     - `src/ai/tools/list-lake-groups.test.ts`
     - `src/ai/index.ts`
     - `aiplans/plan_293.md`
     - `aiplans/tasks_293.md`
   - Message: `feat(ai): add list_lake_groups tool` (with the
     `Co-Authored-By` trailer required by the harness).
   - Do NOT push, do NOT touch `.claude/`, `current-ralph-loop.prompt`,
     or any pre-existing dirty file (`src/ai/chat-controller.ts` is
     left untouched).

## Review

Verified the task list maps 1:1 to plan_293.md:

- Lint baseline captured.
- Module exposes the same surface as `list-route-groups` (with
  `pack.features` instead of `pack.routes`).
- Tests cover happy path, ordering, filtering (removed, non-lake,
  index-0), fallback, default-flag matrix, registry round-trip, and
  the integration default runtime.
- Registration mirrors existing patterns; no extra files touched.
