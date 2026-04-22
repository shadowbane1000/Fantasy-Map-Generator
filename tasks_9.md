# Tasks 9 — Execution checklist for Plan 9

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 134 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/list-burgs.ts`
      - `BurgSummary` with `{i, name, x, y, population, state,
        stateId, culture, cultureId, capital, port, type}`.
      - `BurgsRuntime` with `readBurgs()` + `resolveStateRef()`.
      - Pure helper `readBurgsFromPack(pack, {populationRate,
        urbanization})` — filters index-0 + removed; computes
        population via `round(burg.population * rate * urbanization)`
        with positive-finite guards.
      - `createListBurgsTool(runtime?)` + `listBurgsTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. Update README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/list-burgs.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
