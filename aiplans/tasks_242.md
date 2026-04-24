# Tasks 242 — `find_rivers_by_state`

- [x] Re-read reference files:
  - `src/ai/tools/find-rivers-in-area.ts` (+ test) — river filter analog.
  - `src/ai/tools/find-rivers-by-basin.ts` (+ test) — river filter analog.
  - `src/ai/tools/find-burgs-by-state.ts` (+ test) — state resolution.
  - `src/ai/tools/get-river-info.ts` — river.source / river.mouth semantics.
  - `src/ai/tools/_shared/index.ts` — shared helpers.
- [x] Capture baselines: lint (7w / 1i / 0e), tests (4121 passing).
- [x] Write `aiplans/plan_242.md` and `aiplans/tasks_242.md`.
- [x] Implement `src/ai/tools/find-rivers-by-state.ts`:
  - Constants, types (`FindRiversByStateHit`, `FindRiversByStatePayload`,
    `FindRiversByStateResult`, `ResolvedState`, `ResolveStateResult`).
  - `resolveStateRefInPack` (reuse `findEntityByRef`; 0 → neutral).
  - `findRiversByStateInPack` pure scanner with mouth-or-source indirection.
  - `FindRiversByStateRuntime` + default runtime using `getPack`.
  - `createFindRiversByStateTool(runtime)` + `findRiversByStateTool`.
- [x] Implement tests `src/ai/tools/find-rivers-by-state.test.ts`:
  - Pure scanner: matches mouth-state, matches source-state, matches either,
    empty state, limit truncation, skip i=0 / removed / no endpoints,
    not-ready cases.
  - Resolver: numeric, name, fullName, neutral (0), removed, not-found,
    not-ready.
  - Tool surface: resolved state, numeric + string refs, reject 0 with
    Neutrals message, reject invalid, not-found, not-ready propagation,
    limit validation, default limit, empty payload, schema / constants.
  - `defaultFindRiversByStateRuntime` integration block (uses globalThis).
- [x] Register in `src/ai/index.ts`:
  - Import after `findRiversByBasinTool` import.
  - Export block right after `find-rivers-by-basin` export.
  - `registry.register(...)` after `findRiversByBasinTool`.
- [x] Add README_AI.md row right after `find_rivers_in_area` row. Include API
  key note and usage examples.
- [x] Verify: `npm run build` succeeds, `npm test` all pass (4121 → 4157,
  +36 new), `npm run lint` matches baseline (7w / 1i / 0e).
- [x] Commit with `feat(ai): add find_rivers_by_state tool`.
