# Tasks 39 — Execution checklist for Plan 39

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 468 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-entity-expansionism.ts`
      - `ExpansionableType` + `EXPANSIONABLE_TYPES`.
      - `resolveExpansionableType(s)` alias helper.
      - `EntityExpansionismRef`, `EntityExpansionismRuntime`.
      - `defaultEntityExpansionismRuntime` dispatches by type using
        a `COLLECTION_KEY` map + `findEntityByRef`.
      - `createSetEntityExpansionismTool(runtime?)` +
        `setEntityExpansionismTool`.

- [ ] T3. Delete the narrow
      `src/ai/tools/set-state-expansionism.ts` +
      `set-state-expansionism.test.ts`.

- [ ] T4. Update `src/ai/index.ts`:
      - Drop the old import/export/register.
      - Add the new polymorphic tool's import/export/register.

- [ ] T5. Update README_AI.md — replace the narrow-tool row with
      the polymorphic one.

## Testing

- [ ] T6. `src/ai/tools/set-entity-expansionism.test.ts` — 11
      cases (tool + default-runtime dispatch).

## Gates

- [ ] T7. lint baseline unchanged.
- [ ] T8. `npm test -- --run` green.
- [ ] T9. `npm run build` succeeds.
