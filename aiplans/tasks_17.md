# Tasks 17 — Execution checklist for Plan 17

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 214 tests.

## Implementation

- [ ] T2. `src/ai/tools/rename-province.ts`
      - `ProvinceRef`, `ProvinceMutationRuntime`.
      - `defaultProvinceMutationRuntime` mutates `window.pack.provinces`
        and updates `#provinceLabel{i}` text.
      - Pure helper `findProvinceForRenameInPack`.
      - `createRenameProvinceTool(runtime?)` + `renameProvinceTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/rename-province.test.ts` — cases from plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
