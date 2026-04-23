# Tasks 240 — `find_markers_by_state`

- [x] Re-read reference files:
  - `src/ai/tools/find-burgs-by-religion.ts` (+ test) — cell-indirection.
  - `src/ai/tools/find-burgs-by-state.ts` (+ test) — state resolution + reject Neutrals.
  - `src/ai/tools/list-markers.ts` — marker enumeration.
  - `src/ai/tools/find-markers-by-type.ts` (+ test) — output shape.
  - `src/ai/tools/_shared/index.ts` — shared helpers.
- [x] Capture baselines: lint (7w / 1i / 0e), tests (4058 passing).
- [x] Write `aiplans/plan_240.md` and `aiplans/tasks_240.md`.
- [ ] Implement `src/ai/tools/find-markers-by-state.ts`:
  - Constants, types.
  - `resolveStateRefInPack` (reuse `findEntityByRef`, 0 → neutral).
  - `findMarkersByStateInPack` pure scanner with cell-state indirection.
  - `FindMarkersByStateRuntime` + default runtime with `getPack`.
  - `createFindMarkersByStateTool(runtime)` + `findMarkersByStateTool`.
- [ ] Implement tests `src/ai/tools/find-markers-by-state.test.ts`:
  - Pure scanner: multiple states, empty state, limit truncation, skip i=0 /
    removed / missing cell / out-of-bounds cell, populate fields, not-ready cases.
  - Resolver: numeric, name, fullName, neutral (0), removed, not-found, not-ready.
  - Tool surface: resolved state, numeric + string refs, reject 0 with Neutrals
    message, reject invalid, not-found, not-ready propagation, limit validation,
    default limit, empty payload, schema / constants.
  - `defaultFindMarkersByStateRuntime` integration block (uses globalThis).
- [ ] Register in `src/ai/index.ts`:
  - Import after `findMarkersByTypeTool` import.
  - Export block right after `find-markers-by-type`.
  - `registry.register(...)` after `findMarkersByTypeTool`.
- [ ] Add README_AI.md row right after `find_markers_by_type` row. Include API
  key note and usage examples.
- [ ] Verify: `npm run build` succeeds, `npm test` all pass (4058 + N new),
  `npm run lint` matches baseline (7w / 1i / 0e).
- [ ] Commit with `feat(ai): add find_markers_by_state tool`.
