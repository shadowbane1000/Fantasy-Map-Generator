# Tasks 26 — Execution checklist for Plan 26

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 330 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-world-rates.ts`
      - `WorldRates`, `WorldRatesRuntime`.
      - Pure `validateRatesInput(input)` → `{patch, error?}`.
      - `defaultWorldRatesRuntime`: `read` parses each input's
        `.value`; `write` sets `.value` and dispatches a bubbling
        `change` event so the Units Editor handler runs.
      - `createSetWorldRatesTool(runtime?)` + `setWorldRatesTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-world-rates.test.ts` — 9 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
