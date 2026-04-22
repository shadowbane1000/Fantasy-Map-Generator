# Tasks 29 — Execution checklist for Plan 29

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 360 tests.

## Implementation

- [ ] T2. `src/ai/tools/list-rivers.ts`
      - `RiverSummary`, `RiversRuntime`.
      - Pure `readRiversFromPack(pack)` with basin-name resolution.
      - `createListRiversTool(runtime?)` + `listRiversTool` via
        `createPaginatedListTool`.
      - Filters: `basin` (id or name), `min_length`, `min_discharge`.
      - Basin name lookup rejects with an error if the ref isn't found.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/list-rivers.test.ts` — 13 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
