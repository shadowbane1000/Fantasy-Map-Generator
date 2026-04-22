# Tasks 16 — Execution checklist for Plan 16

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 204 tests.

## Implementation

- [ ] T2. `src/ai/tools/list-provinces.ts`
      - `ProvinceSummary`, `ProvincesRuntime`.
      - Pure `readProvincesFromPack(pack)`.
      - Default runtime reads `window.pack`; reuses
        `resolveStateRefInPack` from `list-burgs`.
      - `createListProvincesTool(runtime?)` + `listProvincesTool`.
      - Limit 1–500 / offset ≥ 0 + optional state filter.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/list-provinces.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
