# Tasks 36 — Execution checklist for Plan 36

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 445 tests.

## Implementation

- [ ] T2. `src/ai/tools/remove-burg.ts`
      - `RemoveBurgRef`, `BurgRemovalRuntime`.
      - `defaultBurgRemovalRuntime` — `find` via `findEntityByRef`;
        `remove(i)` calls `window.Burgs.remove(i)`.
      - `createRemoveBurgTool(runtime?)` + `removeBurgTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/remove-burg.test.ts` — 7 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
