# Tasks 10 — Execution checklist for Plan 10

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 147 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/rename-burg.ts`
      - `BurgMutationRuntime` with `find()` + `rename()`.
      - `defaultBurgMutationRuntime` reads/writes
        `window.pack.burgs[i]`; updates `#burgLabel{i}` textContent.
      - Pure helper `findBurgForRenameInPack(pack, ref)`.
      - Trim input name; reject empty.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. Update README_AI.md tool-table row with examples.

## Testing

- [ ] T5. `src/ai/tools/rename-burg.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.

Each success criterion in plan_10.md has a matching test case in T5.
