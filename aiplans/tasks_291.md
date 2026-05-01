# Tasks — Plan 291 `set_lake_group`

1. Create `src/ai/tools/set-lake-group.ts` implementing:
   - `LakeGroupRef` interface (`{i, name, oldGroup}`).
   - `LakeGroupResolution` discriminated union (`success | ambiguous |
     mismatch | not_found`).
   - `SetLakeGroupRuntime` interface with `find`, `listGroups`, `apply`.
   - `defaultSetLakeGroupRuntime` reading `getPack().features`, querying
     `document.getElementById("lakes")` for groups, and using
     `lakesRoot.querySelector('[data-f="…"]')` for the lake element.
   - `createSetLakeGroupTool(runtime?)` factory returning a `Tool`.
   - `setLakeGroupTool` default export.
   - `findLakeByRef` helper exported (mirroring `findRiverByRef`).
   - Tool description spelling out behaviour, default groups, custom
     groups, and the id-or-name semantics.

2. Create `src/ai/tools/set-lake-group.test.ts` covering all cases listed
   in the plan's test plan (sections A.1–A.11 unit, B.12–B.19 integration).
   Use `vi.fn` for the runtime fake; for integration, build a small fake
   DOM (object with `getElementById` plus child `<g>` stubs that respond
   to `querySelector` / `appendChild`).

3. Wire the tool into `src/ai/index.ts`:
   - Import `setLakeGroupTool` near `setRouteGroupTool` import block
     (alphabetically `set-lake-group` < `set-religion-...` < `set-route-...`).
   - Re-export `createSetLakeGroupTool` and `setLakeGroupTool` near the
     `set-route-group` re-export block.
   - Call `registry.register(setLakeGroupTool)` near the
     `setRouteGroupTool` registration line.

4. Verify:
   - `npx tsc --noEmit` clean.
   - `npm test -- src/ai/tools/set-lake-group.test.ts` passes (and the
     full `npm test` still passes).
   - `npm run lint` does not regress relative to the captured baseline
     (7 warnings, 1 info, 0 errors).

5. Commit on the `plan-291` branch with message
   `feat(ai): add set_lake_group tool`. Stage only the two new files and
   the `src/ai/index.ts` registration changes. Do NOT stage `.claude/`,
   `current-ralph-loop.prompt`, or any pre-existing dirty file. Do NOT
   push.
