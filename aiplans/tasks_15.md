# Tasks 15 — Execution checklist for Plan 15

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 196 tests.

## Implementation

- [ ] T2. `src/ai/tools/rename-religion.ts`
      - `ReligionRef`, `ReligionMutationRuntime`.
      - `defaultReligionMutationRuntime` reads/writes
        `window.pack.religions`, regenerates `code` via
        `window.abbreviate` or `fallbackAbbreviate`
        (imported from `rename-culture`).
      - Pure helper `findReligionForRenameInPack`.
      - `createRenameReligionTool(runtime?)` + `renameReligionTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/rename-religion.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
