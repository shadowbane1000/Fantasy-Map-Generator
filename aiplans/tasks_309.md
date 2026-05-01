# Tasks 309 — `add_burg_group`

Plan ref: `aiplans/plan_309.md`. Worktree:
`/workspace/.claude/worktrees/plan-309` on branch `plan-309`.

## Setup

- [x] Verify worktree on branch `plan-309` based on master @ 1ee280b.
- [x] Capture lint baseline → `aiplans/plan_309.md`.

## Plan + tasks + self-review

- [x] Write `aiplans/plan_309.md`.
- [x] Write `aiplans/tasks_309.md`.
- [x] Self-review pass: re-read plan, fill notes, verify all error
  cases enumerated, fix typos. Note especially the `sanitizeId`
  behavior on `"Marsh towns"` (strips spaces rather than converting
  to hyphens) — tests must match the code, not the prompt's
  example.

## Implementation

- [x] Create `src/ai/tools/add-burg-group.ts`:
  - Imports from `./_shared`, `./index`, and
    `../../utils/stringUtils` (for `sanitizeId`).
  - Types: `AddBurgGroupGroup`, `AddBurgGroupRuntime`,
    `AddBurgGroupInput`.
  - Internal helper for default-order computation
    (`computeDefaultOrder`).
  - `defaultAddBurgGroupRuntime` reading
    `globalThis.options.burgs.groups` and writing
    `localStorage.setItem("burg-groups", ...)`.
  - `createAddBurgGroupTool(runtime?)` factory.
  - Exported `addBurgGroupTool` instance.
  - Tool description references the editor's Add button, the
    `sanitizeId` rule, the no-auto-promote-default divergence, and
    the `"burg-groups"` localStorage key.
- [x] Create `src/ai/tools/add-burg-group.test.ts` with all the test
  cases enumerated in plan section "Tests" (47 tests).
- [x] Wire into `src/ai/index.ts`:
  - Add import alphabetically with the other `add*` imports.
  - Add re-export block.
  - Add `registry.register(addBurgGroupTool)` near the other
    add-group registrations.

## Verification

- [x] `npm test` — all green (5738 tests, no regressions).
- [x] `npm run lint` — same 7 warnings + 1 info as baseline (no new
  errors).
- [x] `npx tsc --noEmit` — clean (TypeScript strict).

## Commit

- [ ] Stage only:
  - `src/ai/tools/add-burg-group.ts`
  - `src/ai/tools/add-burg-group.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_309.md`
  - `aiplans/tasks_309.md`
- [ ] `git commit -m "feat(ai): add add_burg_group tool"`.
- [ ] Don't push. Don't run `git worktree remove`.
- [ ] Don't include `.claude/`, `current-ralph-loop.prompt`, or any
  pre-existing dirty file (e.g. `src/ai/chat-controller.ts`).

## Caveats / open questions

- `sanitizeId` strips spaces (because the regex
  `/[^a-z0-9-_]/g` removes them) BEFORE the
  `/\s+/g, "-"` step has a chance to fire. So
  `"Marsh towns"` becomes `"marshtowns"`, not `"marsh-towns"`. This
  matches the editor's behavior 1:1. Document in tests; do not
  re-implement.
- The "no auto-promote default" divergence from the editor's Apply
  flow is a deliberate primitive-tool choice. Document in tool
  description so the planner knows to chain
  `set_burg_group_default`.
- Persist seam mirrors `set-burg-group-default.ts` (throws-on-
  unavailable). Choosing throw-style keeps consistency with plan 307
  and centralizes catch logic in the tool body.
