# Tasks 28 — Execution checklist for Plan 28

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 352 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-burg-culture.ts`
      - `BurgCultureRuntime` with `findBurg`, `findCulture`,
        `setCulture`.
      - Default runtime: burg via `findEntityByRef`; culture accepts
        id 0 ("Wildlands") plus any non-zero culture via
        `findEntityByRef`.
      - `createSetBurgCultureTool(runtime?)` + `setBurgCultureTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-burg-culture.test.ts` — 8 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
