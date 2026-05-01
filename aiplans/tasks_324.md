# Tasks 324 — `add_relief_icon`

1. Run `npm run lint` and capture the baseline counts (done in
   `plan_324.md`).
2. Write `aiplans/plan_324.md` (use case, behavior, schema, range
   rationale, divergence, files, errors, tests, wiring).
3. Write `aiplans/tasks_324.md` (this file).
4. Self-review: re-read the plan and tasks; verify cross-references
   (line numbers, file paths, sibling-tool names, range bounds).
5. Implement `src/ai/tools/add-relief-icon.ts`:
   - `AddReliefIconRuntime` with `getTerrainRoot(): Element | null`.
   - `defaultAddReliefIconRuntime`: try `window.terrain.node()`, then
     `document.getElementById("terrain")`, else `null`.
   - `createAddReliefIconTool(runtime?)` factory.
   - Eager `addReliefIconTool`.
   - Validation in order: `type` is string → starts with `#`; `x`/`y`
     finite; `size` finite and in `[2, 50]` (default `5`); resolve
     terrain root or error; resolve owner document or fall back to
     `globalThis.document`; create `<use>` via `createElementNS` (SVG
     namespace) when available else `createElement`; set attributes;
     `root.appendChild(use)`.
   - Decimal rounding helper: `round2(v) = Math.round(v * 100) / 100`.
6. Implement `src/ai/tools/add-relief-icon.test.ts` covering every
   case from the plan's Test plan section.
7. Wire into `src/ai/index.ts`:
   - Import the new tool near the other `addX` imports.
   - Re-export `addReliefIconTool`, `createAddReliefIconTool`,
     `defaultAddReliefIconRuntime`, `AddReliefIconRuntime`.
   - Register in `createDefaultRegistry` near the other relief-icon
     registrations.
8. Run the full test/lint/tsc gate:
   - `npm test` — all tests pass.
   - `npm run lint` — counts unchanged from baseline.
   - `npx tsc --noEmit` — clean.
9. Commit with message `feat(ai): add add_relief_icon tool`. Stage:
   - `src/ai/tools/add-relief-icon.ts`
   - `src/ai/tools/add-relief-icon.test.ts`
   - `src/ai/index.ts`
   - `aiplans/plan_324.md`
   - `aiplans/tasks_324.md`
   Do NOT stage `src/ai/chat-controller.ts`, `.claude/`,
   `current-ralph-loop.prompt`, or `temp/`.
10. Report worktree path, branch, commit SHA, and gate statuses.
