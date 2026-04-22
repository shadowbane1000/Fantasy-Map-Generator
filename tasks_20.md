# Tasks 20 — Execution checklist for Plan 20

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 242 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-culture-color.ts`
      - `CultureColorRef`, `CultureColorRuntime`.
      - `defaultCultureColorRuntime` mutates `pack.cultures[i].color`
        and updates `#culture{i}[fill]` + `#cultureCenter{i}[fill]`.
      - `createSetCultureColorTool(runtime?)` + `setCultureColorTool`.
      - Reuse `isValidCssColor` from `set-state-color.ts`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-culture-color.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
