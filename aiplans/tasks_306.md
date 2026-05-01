# Tasks — Plan 306 `set_burg_group_active`

1. Capture lint baseline. (`npm run lint 2>&1 | tail -40`)
   Recorded at the top of `aiplans/plan_306.md`.

2. Write `aiplans/plan_306.md` covering:
   - Use case (mirrors burg-group-editor `validateForm` rule and
     localStorage persistence).
   - Why we don't migrate burgs (`Burgs.defineGroup` skipped).
   - Inputs (`name`, `active`), outputs, error catalog.
   - Last-active validation rule.
   - Runtime-injection seam (`SetBurgGroupActiveRuntime` with
     `getGroups`, `persist`).
   - Files to add (`set-burg-group-active.ts`, `.test.ts`).
   - Wiring in `src/ai/index.ts`.
   - Test plan.
   - Self-review.

3. Write `aiplans/tasks_306.md` (this file).

4. Self-review pass (mandatory):
   - Re-read plan + tasks.
   - Verify: last-active rule is "would deactivation leave zero
     active?" — checking OTHER groups, NOT the target itself.
     Specifically: when `active === false` and current
     `group.active === true`, count groups with `g.active === true &&
     g !== target`.
   - Verify: no-op short-circuit happens BEFORE last-active check —
     a no-op `false→false` should not error even if the group is the
     only "previously active" one.
   - Verify: persistence is best-effort and doesn't block success.
   - Verify: `active` strict-bool matches `list_burg_groups` semantics
     (`group.active === true`).
   - Verify: error messages match the catalog in plan_306.md.
   - Edit if anything is off; record review notes in `plan_306.md`.

5. Implement `src/ai/tools/set-burg-group-active.ts`:
   - Imports: `errorResult`, `getGlobal`, `okResult` from `_shared`;
     `Tool`, `ToolResult` from `index`.
   - Type: `BurgGroupLike { name?: string; active?: boolean }` (loose).
   - `SetBurgGroupActiveRuntime` interface (`getGroups()`,
     `persist(groups)`).
   - `defaultSetBurgGroupActiveRuntime`:
     - `getGroups`: read `options.burgs.groups` via `getGlobal`.
     - `persist`: try-catch around
       `localStorage.setItem("burg-groups", JSON.stringify(groups))`.
       Return true/false.
   - `isActiveBool(g): boolean` — returns `g?.active === true`
     (mirroring `list_burg_groups`).
   - `createSetBurgGroupActiveTool(runtime)` — returns a `Tool`.
   - `setBurgGroupActiveTool` — exported singleton.
   - Description: explains rule + that this does NOT migrate burgs
     (no Burgs.defineGroup re-binning).

6. Implement `src/ai/tools/set-burg-group-active.test.ts`:
   - Helper `makeRuntime(groups, persistImpl?)` for mocked-runtime.
   - Mocked-runtime suite: every test case from plan_306.md test plan
     (happy path, no-ops, last-active edges, activate-always-ok,
     not-found, all input validations, missing/non-array groups,
     persist failure modes, missing-active treated as false).
   - Default-runtime suite touching `globalThis.options` and
     `globalThis.localStorage`. Use `beforeEach`/`afterEach` to
     restore originals. Use a stub Storage object implementing the
     methods the tool calls (`setItem`).
   - Registry round-trip: `setBurgGroupActiveTool.name ===
     "set_burg_group_active"`; `registry.run(...)` succeeds.

7. Wire into `src/ai/index.ts`:
   - Add `import { setBurgGroupActiveTool } from
     "./tools/set-burg-group-active";` next to `setBurgGroupTool`.
   - Add `export { createSetBurgGroupActiveTool,
     setBurgGroupActiveTool } from "./tools/set-burg-group-active";`
     near the existing `set-burg-group` export block.
   - Add `registry.register(setBurgGroupActiveTool);` adjacent to
     `registry.register(setBurgGroupTool);`.

8. Verify:
   - `npm test` (Vitest, node) passes.
   - `npx tsc --noEmit` clean.
   - `npm run lint` does not regress (baseline: 7 warnings + 1 info,
     no errors).

9. Commit on `plan-306` branch:
   - `git add` only:
     - `src/ai/tools/set-burg-group-active.ts`
     - `src/ai/tools/set-burg-group-active.test.ts`
     - `aiplans/plan_306.md`
     - `aiplans/tasks_306.md`
     - `src/ai/index.ts` (only the registration/import/export lines
       added).
   - Do NOT add: `.claude/`, `current-ralph-loop.prompt`,
     `src/ai/chat-controller.ts` (pre-existing dirty), or any other
     unrelated change.
   - Message: `feat(ai): add set_burg_group_active tool`.
   - Do NOT push.

10. Report worktree path, branch, commit SHA, test/tsc/lint status,
    caveats.
