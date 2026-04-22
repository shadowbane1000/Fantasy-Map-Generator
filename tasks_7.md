# Tasks 7 — Execution checklist for Plan 7

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 116 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/rename-state.ts`
      - `StateMutationRuntime` interface with `find()` + `rename()`.
      - `defaultStateMutationRuntime` — reads/writes
        `window.pack.states`; calls `window.drawStateLabels([i])` when
        available.
      - `createRenameStateTool(runtime?)` + `renameStateTool`.
      - Trim input name / fullName; reject empty.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. Update README_AI.md with tool table row + examples.

## Testing

- [ ] T5. `src/ai/tools/rename-state.test.ts` — cases listed in plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` all green.
- [ ] T8. `npm run build` succeeds.

## Verification

Success criteria #1–#7 all have matching tests per the table in
`plan_7.md`.
