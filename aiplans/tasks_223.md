# Tasks — Plan 223 (find_religions_by_culture)

- [x] 0. Baseline: read reference files, confirm lint/tests baseline
      (234 files / 3522 tests / 7 warn, 1 info, 0 err).
- [ ] 1. Write `src/ai/tools/find-religions-by-culture.ts` mirroring
      `find-states-by-culture.ts` with per-religion hit fields
      `{ i, name, type, form, color, deity }`.
- [ ] 2. Write `src/ai/tools/find-religions-by-culture.test.ts` with
      fixture covering multi-culture, culture 0, empty culture, removed
      religion, missing culture field, limit truncation, full error
      paths, plus `defaultFindReligionsByCultureRuntime` integration.
- [ ] 3. Register in `src/ai/index.ts`:
      - import `findReligionsByCultureTool`
      - `export { … } from "./tools/find-religions-by-culture"`
      - `registry.register(findReligionsByCultureTool)` near
        `findStatesByCultureTool`.
- [ ] 4. Add `README_AI.md` row between
      `find_states_by_culture` and `find_provinces_by_state` with API
      key note + usage examples.
- [ ] 5. `npm run build` passes.
- [ ] 6. `npm test` all pass (baseline + new tests).
- [ ] 7. `npm run lint` matches baseline (7 warn, 1 info, 0 err).
- [ ] 8. Commit with `feat(ai): add find_religions_by_culture tool`.
