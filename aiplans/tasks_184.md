# Tasks — Plan 184 (`get_culture_info`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err. Record.
- [x] Baseline: `npm test 2>&1 | tail -5` → 196 files / 2613 tests. Record.
- [x] Read reference files: `list-cultures.ts`, `get-state-info{.ts,.test.ts}`,
  `get-burg-info.ts`, `set-culture-base.ts`, `_shared/index.ts`,
  `_shared/pack-types.ts`, `_shared/find-entity.ts`, `_shared/entity-ref.ts`.
- [ ] Write `src/ai/tools/get-culture-info.ts` with:
  - `CultureInfo` interface covering all resolved fields.
  - `readCultureInfoFromPack(pack, rates, nameBases, ref)` pure helper
    returning `CultureInfo | "not-ready" | "not-found"`.
  - `CultureInfoRuntime` + `defaultCultureInfoRuntime` reading
    `globalThis.pack`, `globalThis.populationRate`,
    `globalThis.urbanization`, `globalThis.nameBases`.
  - `createGetCultureInfoTool(runtime)` and exported `getCultureInfoTool`.
  - Tool schema: `culture` (integer or string, required); description
    references the resolved fields + API-key note.
  - Allow id 0 (Wildlands) — needs a custom numeric-ref branch, since
    `findEntityByRef` + `parseEntityRef` both reject 0.
- [ ] Write `src/ai/tools/get-culture-info.test.ts`:
  - Seam-block tests (fake pack / rates / nameBases) covering the plan cases.
  - `defaultCultureInfoRuntime` integration block using
    `(globalThis as unknown as { pack?: …; populationRate?: …;
    urbanization?: …; nameBases?: … })` writes + `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block + a single
  `registry.register(getCultureInfoTool);` next to `getBurgInfoTool`.
- [ ] Add a README_AI.md row after `get_burg_info` — description with
  API-key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by the number of
  new test cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add get_culture_info tool` staging only the plan,
  tasks, tool file, test file, index.ts, and README_AI.md.
