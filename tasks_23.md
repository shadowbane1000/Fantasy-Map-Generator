# Tasks 23 — Execution checklist for Plan 23

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 301 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-province-color.ts`
      - `ProvinceColorRef`, `ProvinceColorRuntime`.
      - `defaultProvinceColorRuntime`: `find` via `findEntityByRef`;
        `applyColor` mutates `pack.provinces[i].color` and updates
        `#province{i}[fill]` + `#province-gap{i}[stroke]`.
      - `createSetProvinceColorTool(runtime?)` + `setProvinceColorTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-province-color.test.ts` — 8 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
