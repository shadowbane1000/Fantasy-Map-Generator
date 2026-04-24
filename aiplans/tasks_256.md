# Tasks 256 — find_largest_provinces

- [x] Read analog tools: find-largest-states, find-largest-cultures, get-province-info, list-provinces, _shared barrel.
- [x] Confirm baseline: lint 7 warn / 1 info / 0 err; tests 268 files / 4535 tests.
- [x] Write plan + tasks.
- [ ] Implement `src/ai/tools/find-largest-provinces.ts` (pure ranker, runtime seam, tool factory + singleton).
- [ ] Implement `src/ai/tools/find-largest-provinces.test.ts` — pure ranker + tool surface + integration block.
- [ ] Register tool in `src/ai/index.ts` (import + export + `registry.register`).
- [ ] Add README_AI.md row near `find_largest_states` / `find_largest_religions`.
- [ ] `npm run build` passes.
- [ ] `npm test` passes; count increased by 1 test file + the new tests.
- [ ] `npm run lint` baseline unchanged (7 warn / 1 info / 0 err).
- [ ] Commit `feat(ai): add find_largest_provinces tool` with scoped files only.
