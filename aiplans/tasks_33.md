# Tasks 33 — Execution checklist for Plan 33

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 414 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-burg-type.ts`
      - `BURG_TYPES` tuple, `BurgType` type.
      - Pure `resolveBurgType(s)` helper.
      - `BurgTypeRef`, `BurgTypeRuntime`.
      - `defaultBurgTypeRuntime`: `findEntityByRef` for burgs;
        `apply` mutates `pack.burgs[i].type`.
      - `createSetBurgTypeTool(runtime?)` + `setBurgTypeTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-burg-type.test.ts` — 9 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
