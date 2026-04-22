# Tasks 34 — Execution checklist for Plan 34

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 424 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-state-capital.ts`
      - `StateCapitalState`, `StateCapitalBurg`, `StateCapitalRuntime`.
      - Default runtime: findState via `findEntityByRef`,
        findBurg via `findEntityByRef`, promote mutates
        `pack.states[i]` + `pack.burgs[i].capital` on both old and
        new, calls `window.Burgs.changeGroup` when present.
      - `createSetStateCapitalTool(runtime?)` + `setStateCapitalTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-state-capital.test.ts` — 9 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
