# Tasks 24 — Execution checklist for Plan 24

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 309 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-burg-population.ts`
      - `BurgPopulationRef`, `BurgPopulationRuntime`.
      - Pure `scaleDisplayToInternal(display, rates)` helper with
        4-decimal rounding and non-positive-rate fallback.
      - `defaultBurgPopulationRuntime` reads `window.pack`,
        `window.populationRate`, `window.urbanization`; uses
        `findEntityByRef` for lookups.
      - `createSetBurgPopulationTool(runtime?)` + `setBurgPopulationTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-burg-population.test.ts` — 9 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
