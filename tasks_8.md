# Tasks 8 — Execution checklist for Plan 8

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 124 tests.

## Implementation

- [ ] T2. Create `src/ai/tools/focus-on-map.ts`
      - `ZoomRuntime` with `findBurg`, `findState`, `zoomTo`,
        `resetZoom`.
      - Default runtime reads `window.pack` for lookups and calls
        `window.zoomTo` / `window.resetZoom`.
      - State coords: prefer `state.pole`, else
        `pack.burgs[state.capital]`.
      - `createFocusOnMapTool(runtime?)` + `focusOnMapTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. Update README_AI.md.

## Testing

- [ ] T5. `src/ai/tools/focus-on-map.test.ts` — cases listed in plan.

## Gates

- [ ] T6. `npm run lint` baseline.
- [ ] T7. `npm test -- --run` all pass.
- [ ] T8. `npm run build` succeeds.
