# Tasks — Plan 182 (`get_state_info`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err. Record.
- [x] Baseline: `npm test 2>&1 | tail -5` → 194 files / 2573 tests. Record.
- [x] Read reference files: `list-states{.ts,.test.ts}`, `get-cell-info{.ts,.test.ts}`,
  `get-map-info{.ts,.test.ts}`, `list-diplomacy.ts`, `rename-state.ts`,
  `_shared/index.ts`, `_shared/find-entity.ts`, `_shared/entity-ref.ts`,
  `src/types/PackedGraph.ts`.
- [ ] Write `src/ai/tools/get-state-info.ts` with:
  - `StateInfo` interface covering all resolved fields.
  - `readStateInfoFromPack(pack, rates, ref)` pure helper returning
    `StateInfo | "not-ready" | "not-found" | "neutral"`.
  - `StateInfoRuntime` + `defaultStateInfoRuntime` reading
    `globalThis.pack`, `globalThis.populationRate`, `globalThis.urbanization`.
  - `createGetStateInfoTool(runtime)` and exported `getStateInfoTool`.
  - Tool schema: `state` (integer or string, required); description
    references the resolved fields + API-key note.
- [ ] Write `src/ai/tools/get-state-info.test.ts`:
  - Seam-block tests (fake pack / rates) covering the plan cases.
  - `defaultStateInfoRuntime` integration block using
    `(globalThis as unknown as { pack?: …; populationRate?: …; urbanization?: … })`
    writes + `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block + a single
  `registry.register(getStateInfoTool);` next to `getCellInfoTool`.
- [ ] Add a README_AI.md row after `get_cell_info` — description with
  API-key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by the number of
  new test cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add get_state_info tool` staging only the plan,
  tasks, tool file, test file, index.ts, and README_AI.md.
