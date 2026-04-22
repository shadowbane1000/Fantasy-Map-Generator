# Tasks 18 — Execution checklist for Plan 18

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 223 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-state-color.ts`
      - `StateColorRef`, `StateColorRuntime`.
      - Pure validator `isValidCssColor`.
      - `defaultStateColorRuntime` mutates `pack.states[i].color`, and
        updates `#state{i}[fill]`, `#state-gap{i}[stroke]`, and
        `#state-border{i}[stroke]` (with a darker tint when `d3.color`
        is available).
      - `createSetStateColorTool(runtime?)` + `setStateColorTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-state-color.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
