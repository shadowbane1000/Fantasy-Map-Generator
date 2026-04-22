# Tasks 12 — Execution checklist for Plan 12

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 168 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/list-cultures.ts`
      - `CultureSummary` + `CulturesRuntime`.
      - Pure `readCulturesFromPack(pack, populationRate)`.
      - `createListCulturesTool(runtime?)` + `listCulturesTool`.
      - Limit 1–500 / offset ≥ 0.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/list-cultures.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
