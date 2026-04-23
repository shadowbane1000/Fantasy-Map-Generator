# Tasks — Plan 185 (`get_religion_info`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err. Record.
- [x] Baseline: `npm test 2>&1 | tail -5` → 196 files / 2613 tests. Record.
- [x] Read reference files: `list-religions.ts`, `get-state-info{.ts,.test.ts}`,
  `set-religion-{color,type,form,deity,expansion,culture,center,origins}.ts`,
  `_shared/index.ts`, `_shared/pack-types.ts`, `_shared/find-entity.ts`,
  `_shared/entity-ref.ts`.
- [ ] Write `src/ai/tools/get-religion-info.ts` with:
  - `ReligionInfo` interface covering all resolved fields.
  - `readReligionInfoFromPack(pack, rates, ref)` pure helper returning
    `ReligionInfo | "not-ready" | "not-found" | "placeholder"`.
  - `ReligionInfoRuntime` + `defaultReligionInfoRuntime` reading
    `globalThis.pack`, `globalThis.populationRate`, `globalThis.urbanization`.
  - `createGetReligionInfoTool(runtime)` and exported `getReligionInfoTool`.
  - Tool schema: `religion` (integer or string, required); description
    references the resolved fields + API-key note.
- [ ] Write `src/ai/tools/get-religion-info.test.ts`:
  - Seam-block tests (fake pack / rates) covering the plan cases.
  - `defaultReligionInfoRuntime` integration block using
    `(globalThis as unknown as { pack?: …; populationRate?: …; urbanization?: … })`
    writes + `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block + a single
  `registry.register(getReligionInfoTool);` next to `getStateInfoTool`.
- [ ] Add a README_AI.md row after the `get_state_info` row — description with
  API-key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by the number of
  new test cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add get_religion_info tool` staging only the plan,
  tasks, tool file, test file, index.ts, and README_AI.md.
