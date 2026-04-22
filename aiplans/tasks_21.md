# Tasks 21 — Execution checklist for Plan 21

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 277 tests.

## Implementation

- [ ] T2. `src/ai/tools/load-map.ts`
      - `LoadSource`, `LoadInstruction`, `LoadMapRuntime`.
      - Pure helpers `resolveLoadSource` + `isValidMapUrl`.
      - `defaultLoadMapRuntime` wrapping `window.quickLoad` /
        `window.loadMapFromURL`, plus a `map:generated` waiter with
        timeout/abort.
      - `createLoadMapTool(runtime?, timeoutMs?)` + `loadMapTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/load-map.test.ts` — 12 cases from the plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
