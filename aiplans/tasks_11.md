# Tasks 11 — Execution checklist for Plan 11

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 155 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/set-year-and-era.ts`
      - `WorldDateRuntime` with `read()`, `writeYear()`,
        `writeEra()`.
      - `defaultWorldDateRuntime` reads/writes `window.options` and
        syncs `#yearInput` / `#eraInput` values.
      - Pure helper `deriveEraShort(era: string): string`.
      - `createSetYearAndEraTool(runtime?)` + `setYearAndEraTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. Update README_AI.md tool-table row with examples.

## Testing

- [ ] T5. `src/ai/tools/set-year-and-era.test.ts`
      Covers criteria 1–9 plus direct `deriveEraShort` tests.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
