# Tasks 4 — Execution checklist for Plan 4

## Setup

- [ ] T1. Confirm baseline (7 warnings / 1 info / 0 errors; 95 tests).

## Implementation

- [ ] T2. Create `src/ai/tools/get-map-info.ts`
      - `interface MapInfo` with fields from plan.
      - `interface MapStateRuntime { readState(): MapInfo | null; }`.
      - `defaultMapStateRuntime` reads `window.pack`, `window.grid`,
        `window.seed`, `window.mapId`, `window.graphWidth`,
        `window.graphHeight`, `window.options`,
        `document.getElementById("mapName")?.value`.
      - `createGetMapInfoTool(runtime?)` + `getMapInfoTool`.
      - Count helper subtracts 1 for states/provinces/religions/cultures
        (which use a neutral 0-index); rivers/markers/zones/cells
        counted raw; burgs also subtract 1 per Azgaar's convention
        (`pack.burgs[0]` is the "no-burg" placeholder).

- [ ] T3. Update `src/ai/index.ts`: register + export.

- [ ] T4. Update `README_AI.md`: add tool row.

## Testing

- [ ] T5. Create `src/ai/tools/get-map-info.test.ts`
      Cases described in plan.

## Gates

- [ ] T6. `npm run lint` at baseline.
- [ ] T7. `npm test -- --run` all green.
- [ ] T8. `npm run build` succeeds.

## Plan↔tasks↔tests verification

- Reads correct counts → Test 2 asserts each count type.
- Graceful pre-load → Test 4.
- JSON-valid return → Test 1/6 parse the result.
