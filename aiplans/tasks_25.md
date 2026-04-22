# Tasks 25 — Execution checklist for Plan 25

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 320 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-state-form.ts`
      - `FORM_CATEGORIES`, `CanonicalForm`, `StateFormRef`,
        `StateFormRuntime`.
      - Static `FORMS_BY_CATEGORY` map reflecting the Monarchy /
        Republic / Union / Theocracy / Anarchy optgroups from
        `src/index.html:4506-4582`.
      - Pure `resolveFormName(s)` helper.
      - `defaultStateFormRuntime` mutates `pack.states[i].form` +
        `.formName`; calls `window.drawStateLabels([i])` if available.
      - `createSetStateFormTool(runtime?)` + `setStateFormTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-state-form.test.ts` — cases 1–14 from the
      plan.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
