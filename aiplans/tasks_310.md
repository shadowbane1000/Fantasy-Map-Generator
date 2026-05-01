# Tasks 310 — `add_iceberg`

Plan ref: `aiplans/plan_310.md`. Worktree:
`/workspace/.claude/worktrees/plan-310` on branch `plan-310` (based on
master @ 46075ec).

## Setup

- [x] Verify worktree on branch `plan-310` based on master @ 46075ec.
- [x] Capture lint baseline → `aiplans/plan_310.md`.

## Plan + tasks + self-review

- [x] Write `aiplans/plan_310.md`.
- [x] Write `aiplans/tasks_310.md`.
- [x] Self-review pass: verify all error cases enumerated, including
  the "wrong type" guard for the `Ice.addIceberg` push and the cell
  range check.

## Implementation

- [ ] Create `src/ai/tools/add-iceberg.ts`:
  - Imports from `./_shared` and `./index`.
  - Types: `AddIcebergIceEntry`, `AddIcebergRuntime`,
    `AddIcebergInput` (just `{x, y, size}`).
  - `defaultAddIcebergRuntime` resolving each dep through `globalThis`
    (`findGridCell`, `grid`, `Ice.addIceberg`, `pack.ice`). Each
    missing dep throws a specific error.
  - `createAddIcebergTool(runtime?)` factory.
  - Exported `addIcebergTool` instance.
  - Tool description references the editor's Add Iceberg button, the
    `(x, y, size)` shape, and the `Ice.addIceberg` legacy module.
- [ ] Create `src/ai/tools/add-iceberg.test.ts` covering all cases
  enumerated in plan section "Tests".
- [ ] Wire into `src/ai/index.ts`:
  - Add import alphabetically (between `addHillTool` and
    `addLabelGroupTool`).
  - Add re-export block.
  - Add `registry.register(addIcebergTool)` near the other `add*`
    registrations.

## Verification

- [ ] `npm test` — all green.
- [ ] `npm run lint` — same 7 warnings + 1 info as baseline (no new
  errors).
- [ ] `npx tsc --noEmit` — clean.

## Commit

- [ ] Stage only:
  - `src/ai/tools/add-iceberg.ts`
  - `src/ai/tools/add-iceberg.test.ts`
  - `src/ai/index.ts`
  - `aiplans/plan_310.md`
  - `aiplans/tasks_310.md`
- [ ] `git commit -m "feat(ai): add add_iceberg tool"`.
- [ ] Don't push. Don't run `git worktree remove`.
- [ ] Don't include `.claude/`, `current-ralph-loop.prompt`, or any
  pre-existing dirty file (e.g. `src/ai/chat-controller.ts`).

## Caveats / open questions

- Size upper bound of 5 is a chosen primitive cap; the legacy UI input
  has no max. Document in tool description and tests.
- We deliberately verify the type of the last pushed entry ===
  `"iceberg"`. This is paranoid (the legacy `Ice.addIceberg` only ever
  pushes icebergs) but cheap and protects against future changes.
- Default runtime resolves globals lazily on every method call so
  tests can swap them between invocations. Matches `add-marker.ts`.
