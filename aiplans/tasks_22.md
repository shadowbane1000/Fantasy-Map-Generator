# Tasks 22 — Execution checklist for Plan 22

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 293 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-religion-color.ts`
      - `ReligionColorRef`, `ReligionColorRuntime`.
      - `defaultReligionColorRuntime`: `find` via `findEntityByRef`;
        `applyColor` mutates `pack.religions[i].color` and updates
        `#religion{i}[fill]` and `#religionsCenter{i}[fill]`.
      - `createSetReligionColorTool(runtime?)` + `setReligionColorTool`.
      - Reuse `isValidCssColor` from `set-state-color.ts`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-religion-color.test.ts` — 8 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
