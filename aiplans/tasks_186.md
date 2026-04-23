# Tasks — Plan 186 (`get_province_info`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err.
- [x] Baseline: `npm test 2>&1 | tail -5` → 198 files / 2659 tests.
- [x] Read reference files: `list-provinces.ts`,
  `get-state-info{.ts,.test.ts}`, `get-culture-info{.ts,.test.ts}`,
  `get-religion-info.ts`, `set-province-capital.ts`,
  `set-province-coa-custom.ts`, `_shared/index.ts`,
  `_shared/pack-types.ts`, `_shared/find-entity.ts`, `_shared/entity-ref.ts`.
- [ ] Write `src/ai/tools/get-province-info.ts` with:
  - `ProvinceInfo` interface covering all resolved fields.
  - `readProvinceInfoFromPack(pack, rates, ref)` pure helper returning
    `ProvinceInfo | "not-ready" | "not-found" | "placeholder"`.
  - `ProvinceInfoRuntime` + `defaultProvinceInfoRuntime` reading
    `globalThis.pack`, `globalThis.populationRate`, `globalThis.urbanization`.
  - `createGetProvinceInfoTool(runtime)` and exported `getProvinceInfoTool`.
  - Tool schema: `province` (integer or string, required); description
    references the resolved fields + API-key note.
- [ ] Write `src/ai/tools/get-province-info.test.ts`:
  - Seam-block tests (fake pack / rates) covering the plan cases.
  - `defaultProvinceInfoRuntime` integration block using
    `(globalThis as unknown as { pack?: …; populationRate?: …; urbanization?: … })`
    writes + `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block + a
  single `registry.register(getProvinceInfoTool);` next to
  `getStateInfoTool`, `getReligionInfoTool`, `getCultureInfoTool`.
- [ ] Add a README_AI.md row after the `get_state_info` /
  `get_religion_info` / `get_culture_info` row — description with
  API-key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by the number of
  new test cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add get_province_info tool` staging only the
  plan, tasks, tool file, test file, `index.ts`, and `README_AI.md`.
