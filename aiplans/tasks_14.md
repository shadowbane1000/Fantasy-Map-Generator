# Tasks 14 — Execution checklist for Plan 14

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 188 tests.

## Implementation

- [ ] T2. `src/ai/tools/list-religions.ts`
      - `ReligionSummary`, `ReligionsRuntime`.
      - Pure `readReligionsFromPack(pack, populationRate)`.
      - `createListReligionsTool(runtime?)` + `listReligionsTool`.
      - Limit 1–500 / offset ≥ 0.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/list-religions.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` all pass.
- [ ] T8. `npm run build` succeeds.
