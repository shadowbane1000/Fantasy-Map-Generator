# Tasks — Plan 305 `move_label`

1. Capture lint baseline. (`npm run lint 2>&1 | tail -40`)
   Recorded at top of `aiplans/plan_305.md`.

2. Write `aiplans/plan_305.md` covering:
   - Use case (mirrors `dragLabel` end-state in `labels-editor.js`).
   - Absolute-not-delta design choice + documented limitation.
   - Inputs / outputs / errors.
   - Runtime-injection seam (`MoveLabelRuntime` with `findLabel`,
     `getTransform`, `setTransform`).
   - Translate regex
     `/translate\(\s*([-\d.eE+]+)\s*[,\s]\s*([-\d.eE+]+)\s*\)/`.
   - Files to add (`move-label.ts`, `move-label.test.ts`).
   - Wiring in `src/ai/index.ts`.
   - Test plan.
   - Self-review.

3. Write `aiplans/tasks_305.md` (this file).

4. Self-review pass (mandatory):
   - Re-read plan + tasks.
   - Verify: regex form correct; `<textPath>` `d` is NOT mutated; old
     values null (not 0) on parse failure; absolute coords; error
     messages mirror `set_label_size`.
   - Edit if anything is off; record review notes inside `plan_305.md`.

5. Implement `src/ai/tools/move-label.ts`:
   - Imports: `errorResult`, `getGlobal`, `okResult` from `_shared`;
     `Tool`, `ToolResult` from `index`; `LabelLookup` from
     `set-label-group`.
   - Local helpers `getDocument`, `resolveLabelsRoot`,
     `isDirectGroupChildOfLabels`, `classifyFoundElement` mirroring
     `set-label-size.ts` (copy, do not import — those helpers are not
     exported).
   - `MoveLabelRuntime` interface (`findLabel`, `getTransform`,
     `setTransform`).
   - `defaultMoveLabelRuntime` implementation.
   - `parseTranslate(raw: string | null): { x: number, y: number } | null`
     module-level helper that returns null on no-match / non-finite
     parse.
   - `createMoveLabelTool(runtime)` — returns a `Tool`.
   - `moveLabelTool` — exported singleton from
     `createMoveLabelTool()`.
   - Description string explaining the absolute-position contract,
     the limitation (no `get_label_info` yet), and the
     `<textPath>` non-mutation guarantee.

6. Implement `src/ai/tools/move-label.test.ts`:
   - Mocked-runtime suite covering every test case in plan.
   - Default-runtime DOM-mock suite using `setupDom` similar to
     `set-label-size.test.ts`.
   - Registry round-trip via `ToolRegistry`.

7. Wire into `src/ai/index.ts`:
   - Add `import { moveLabelTool } from "./tools/move-label";` near
     `move-burg` / `move-marker` imports.
   - Add `export { createMoveLabelTool, moveLabelTool } from "./tools/move-label";`
     near the existing `move-burg` / `move-marker` export blocks.
   - Add `registry.register(moveLabelTool);` adjacent to
     `registry.register(moveBurgTool);`.

8. Verify:
   - `npm test` (Vitest, node) passes.
   - `npx tsc --noEmit` clean.
   - `npm run lint` does not regress (baseline: 7 warnings + 1 info,
     no errors).

9. Commit on `plan-305` branch:
   - `git add` only:
     - `src/ai/tools/move-label.ts`
     - `src/ai/tools/move-label.test.ts`
     - `aiplans/plan_305.md`
     - `aiplans/tasks_305.md`
     - `src/ai/index.ts` (only the registration/import/export lines
       added).
   - Do NOT add: `.claude/`, `current-ralph-loop.prompt`,
     `src/ai/chat-controller.ts` (pre-existing dirty file), or any
     other unrelated change.
   - Message: `feat(ai): add move_label tool`.
   - Do NOT push.

10. Report worktree path, branch, commit SHA, test/tsc/lint status,
    caveats.
