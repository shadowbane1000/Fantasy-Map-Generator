# Tasks 30 — Execution checklist for Plan 30

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 377 tests.

## Implementation

- [ ] T2. `src/ai/tools/list-routes.ts`
      - `RouteGroup`, `RouteSummary`, `RoutesRuntime`.
      - Pure `readRoutesFromPack(pack)`.
      - `createListRoutesTool(runtime?)` + `listRoutesTool` via
        `createPaginatedListTool`.
      - Filters: `group` (resolves to one of roads/trails/searoutes),
        `min_length`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/list-routes.test.ts` — 10 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
