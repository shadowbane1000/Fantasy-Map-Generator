# Tasks for Plan 290 — `rename_lake`

1. **Lint baseline captured.** `npm run lint`: 7 warnings, 1 info, 0
   errors, 680 files. (Recorded in `aiplans/plan_290.md`.)
2. **Create `src/ai/tools/rename-lake.ts`:**
   1. Type `LakeRenameRef = { i: number; name: string; group: string }`.
   2. Type `LakeRenameRuntime`:
      - `findById(id: number): LakeRenameRef | null`
      - `findByName(name: string): { matches: LakeRenameRef[] }`
      - `rename(i: number, newName: string): void`
   3. Pure helper `findLakeById(features, id)` — iterates
      `features[1..]`, returns the first `type === "lake"` feature
      matching `i`, or null.
   4. Pure helper `findLakesByName(features, name)` — case-insensitive
      trimmed match; collects all `type === "lake"` matches.
   5. `defaultRenameLakeRuntime` uses `getPack<{ features?: ... }>()`
      and the helpers above; `rename` throws when pack/features
      missing or feature gone.
   6. `createRenameLakeTool(runtime?)` returns a `Tool` whose
      `execute` enforces all validation rules (see plan), normalises
      the new name via `.trim()`, calls `runtime.rename`, and returns
      `okResult({ id, old_name, new_name })`.
   7. `renameLakeTool = createRenameLakeTool()`.
3. **Create `src/ai/tools/rename-lake.test.ts`** with the test cases
   listed in plan section "Test plan (Vitest)" (numbered 1-20).
4. **Wire up in `src/ai/index.ts`:**
   1. Add `import { renameLakeTool } from "./tools/rename-lake";`
      immediately before the existing `rename-province` import.
   2. Add the re-export block (`createRenameLakeTool`,
      `findLakeById`, `findLakesByName`, `renameLakeTool`) immediately
      before the existing `rename-province` re-export block.
   3. Add `registry.register(renameLakeTool);` between
      `renameCultureTool` and `renameReligionTool`.
5. **Run `npx tsc --noEmit`.** Must pass clean.
6. **Run `npm test`.** All tests pass.
7. **Run `npm run lint`.** Counts must equal baseline: 7 warnings,
   1 info, 0 errors.
8. **Commit on branch `plan-290`** with message
   `feat(ai): add rename_lake tool`. Stage only:
   - `src/ai/tools/rename-lake.ts`
   - `src/ai/tools/rename-lake.test.ts`
   - `src/ai/index.ts`
   - `aiplans/plan_290.md`
   - `aiplans/tasks_290.md`
   Do not stage `.claude/`, `current-ralph-loop.prompt`, or any
   pre-existing dirty file. Do not push.
