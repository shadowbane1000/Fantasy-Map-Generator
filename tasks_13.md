# Tasks 13 — Execution checklist for Plan 13

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 176 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/rename-culture.ts`
      - `CultureRef`, `CultureMutationRuntime` interfaces.
      - `defaultCultureMutationRuntime` reads/writes
        `window.pack.cultures`, regenerates `code` via
        `window.abbreviate(name, otherCodes)` (with graceful fallback).
      - Pure helper `findCultureForRenameInPack`.
      - `createRenameCultureTool(runtime?)` + `renameCultureTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. Update README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/rename-culture.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` all pass.
- [ ] T8. `npm run build` succeeds.
