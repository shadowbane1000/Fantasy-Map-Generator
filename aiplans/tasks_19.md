# Tasks 19 — Execution checklist for Plan 19

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 233 tests.

## Implementation

- [ ] T2. `src/ai/tools/save-map.ts`
      - `SaveMethod`, `SaveMapRuntime`, default runtime wrapping
        `window.saveMap`.
      - Alias table mapping friendly `target` strings to method names.
      - `createSaveMapTool(runtime?)` + `saveMapTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/save-map.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
