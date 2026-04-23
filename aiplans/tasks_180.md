# Tasks — Plan 180 (`measure_distance`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err.
- [x] Baseline: `npm test 2>&1 | tail -5` → 192 files / 2521 tests.
- [x] Read reference files: `public/modules/ui/measurers.js` (`getLength`,
  `updateLabel`), `public/main.js` (`distanceScale`), `src/ai/tools/
  find-nearest-burg{.ts,.test.ts}`, `src/ai/tools/find-cell-at-coords.ts`,
  `src/ai/tools/add-ruler.ts`, `src/ai/tools/_shared/{find-entity,results,
  globals,pack-types}.ts`.
- [ ] Write `src/ai/tools/measure-distance.ts`:
  - `PointSpec` / `ResolvedPoint` / `PointError` types.
  - `measureDistanceInPack(pack, from, to)` pure helper.
  - `MeasureDistanceRuntime` + `defaultMeasureDistanceRuntime`
    reading `globalThis.pack`, `globalThis.distanceScale`, and the
    DOM input `#distanceUnitInput`.
  - `createMeasureDistanceTool(runtime)` + exported `measureDistanceTool`.
  - Schema: `from_cell` / `to_cell` / `from_burg` / `to_burg` /
    `from_x` / `from_y` / `to_x` / `to_y` all optional; runtime enforces
    "exactly one form".
  - Description references `distanceScale` + Euclidean + "API key" note.
- [ ] Write `src/ai/tools/measure-distance.test.ts`:
  - Seam-block tests covering items 1–8 in the plan.
  - Tool-surface tests covering items 9–16.
  - `defaultMeasureDistanceRuntime` integration block (items 17–19) using
    `(globalThis as unknown as { pack?; distanceScale?; options? })` writes
    + `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + re-export block + a single
  `registry.register(measureDistanceTool);` near `findNearestBurgTool`.
- [ ] Add a README_AI.md row right after `find_nearest_burg` with API key
  note and 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add measure_distance tool` staging plan, tasks,
  tool, test, index.ts, and README_AI.md.
