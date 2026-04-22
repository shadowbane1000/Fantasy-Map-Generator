# Tasks 38 — Execution checklist for Plan 38

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 460 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-state-expansionism.ts`
      - `StateExpansionismRef`, `StateExpansionismRuntime`.
      - `defaultStateExpansionismRuntime`: `findEntityByRef` for the
        state; `apply` mutates `pack.states[i].expansionism`.
      - Range validation: finite, > 0, ≤ 100.
      - `createSetStateExpansionismTool(runtime?)` +
        `setStateExpansionismTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-state-expansionism.test.ts` — 8 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
