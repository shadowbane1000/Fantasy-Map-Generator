# Tasks 27 — Execution checklist for Plan 27

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 341 tests.

## Implementation

- [ ] T2. `src/ai/tools/list-markers.ts`
      - `MarkerSummary`, `MarkersRuntime`.
      - Pure `readMarkersFromPack(pack, notes)`.
      - `createListMarkersTool(runtime?)` + `listMarkersTool` via
        `createPaginatedListTool`.
      - Filters: type (exact, case-insensitive), pinned_only.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/list-markers.test.ts` — 10 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
