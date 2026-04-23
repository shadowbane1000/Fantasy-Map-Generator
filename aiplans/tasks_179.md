# Tasks — Plan 179 (`find_nearest_burg`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err. Record.
- [x] Baseline: `npm test 2>&1 | tail -5` → 190 files / 2475 tests. Record.
- [x] Read reference files: `src/ai/tools/list-burgs.ts`,
  `src/ai/tools/get-cell-info{.ts,.test.ts}`, `src/ai/tools/add-burg.ts`,
  `src/ai/tools/_shared/{results,globals,pack-types,find-entity}.ts`,
  `src/ai/tools/index.ts`, and the existing `README_AI.md` row shape.
- [ ] Write `src/ai/tools/find-nearest-burg.ts` with:
  - `FindNearestBurgHit`, `FindNearestBurgResult` types.
  - `findNearestBurgInPack(pack, query)` pure helper.
  - `FindNearestBurgRuntime` + `defaultFindNearestBurgRuntime` reading
    `globalThis.pack`.
  - `createFindNearestBurgTool(runtime)` + exported `findNearestBurgTool`.
  - Tool schema: `x`, `y`, `cell` all optional at schema level, with
    runtime validation enforcing "exactly one form".
  - Description references `pack.burgs` + Euclidean distance + "API key" note.
- [ ] Write `src/ai/tools/find-nearest-burg.test.ts`:
  - Seam-block tests covering the 16 cases from the plan.
  - `defaultFindNearestBurgRuntime` integration block using
    `(globalThis as unknown as { pack?: ... })` writes + `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { ... }` block + a single
  `registry.register(findNearestBurgTool);` near `listBurgsTool`.
- [ ] Add a README_AI.md row mirroring `list_burgs` / `get_cell_info`'s shape —
  description with API key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add find_nearest_burg tool` staging only the plan,
  tasks, tool file, test file, index.ts, and README_AI.md.
