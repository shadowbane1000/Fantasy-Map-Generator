# Tasks 307 — `set_burg_group_default`

Plan ref: `aiplans/plan_307.md`. Worktree: `/workspace/.claude/worktrees/plan-307` on branch `plan-307`.

## Setup

- [x] Verify worktree on branch `plan-307` based on master @ 0c81858.
- [x] Capture lint baseline → `aiplans/plan_307.md`.

## Plan + tasks + self-review

- [x] Write `aiplans/plan_307.md`.
- [x] Write `aiplans/tasks_307.md`.
- [ ] Self-review pass: re-read plan, fill notes, verify all error
  cases enumerated, fix typos.

## Implementation

- [ ] Create `src/ai/tools/set-burg-group-default.ts`:
  - Imports from `./_shared` and `./index`.
  - Types: `SetBurgGroupDefaultGroup`, `SetBurgGroupDefaultRuntime`.
  - Internal helper `findPreviousDefault(groups)` →
    `string | string[] | null`.
  - Internal helper `applyDefault(groups, name)` returns
    `{ changed: boolean }`.
  - `defaultSetBurgGroupDefaultRuntime` reading
    `globalThis.options.burgs.groups` and writing
    `localStorage.setItem("burg-groups", ...)`.
  - `createSetBurgGroupDefaultTool(runtime?)` factory.
  - Exported `setBurgGroupDefaultTool` instance.
  - Tool description references the editor's radio semantics and
    the `"burg-groups"` localStorage key.
- [ ] Create `src/ai/tools/set-burg-group-default.test.ts` with all
  cases enumerated in plan section "Tests" (15 tests minimum).
- [ ] Wire into `src/ai/index.ts`:
  - Add import alphabetically.
  - Add re-export block.
  - Add `registry.register(setBurgGroupDefaultTool)`.

## Verification

- [ ] `npm test` — all green (no regressions).
- [ ] `npm run lint` — same 7 warnings + 1 info as baseline (no new
  errors).
- [ ] `npx tsc --noEmit` — clean (TypeScript strict).

## Commit

- [ ] Stage only:
  - `src/ai/tools/set-burg-group-default.ts`
  - `src/ai/tools/set-burg-group-default.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_307.md`
  - `aiplans/tasks_307.md`
- [ ] `git commit -m "feat(ai): add set_burg_group_default tool"`.
- [ ] Don't push. Don't run `git worktree remove`.
- [ ] Don't include `.claude/`, `current-ralph-loop.prompt`, or any
  pre-existing dirty file (e.g. `src/ai/chat-controller.ts`).

## Caveats / open questions

- The runtime's persist seam intentionally throws when localStorage
  is missing rather than silently no-op'ing — the tool catches and
  reports `persisted: false`. This keeps the seam easy to mock in
  tests.
- Case-sensitive name match is a deliberate choice; document in the
  tool description.
