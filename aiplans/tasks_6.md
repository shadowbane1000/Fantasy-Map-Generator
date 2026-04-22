# Tasks 6 — Execution checklist for Plan 6

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 107 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/list-states.ts`
      - `StateSummary` + `StatesRuntime` interface.
      - `defaultStatesRuntime`: reads `window.pack.states`, skips
        index-0 and `removed`, resolves culture/capital names via
        `window.pack.cultures` / `window.pack.burgs`.
      - `createListStatesTool(runtime?)` + `listStatesTool`.
      - Validates `limit` (1..500, int) and `offset` (>=0, int).

- [ ] T3. Register + export in `src/ai/index.ts`.
- [ ] T4. Add README_AI.md tool row.

## Testing

- [ ] T5. `src/ai/tools/list-states.test.ts` — cases listed in plan.

## Gates

- [ ] T6. `npm run lint` — baseline.
- [ ] T7. `npm test -- --run` — all pass.
- [ ] T8. `npm run build` — succeeds.
