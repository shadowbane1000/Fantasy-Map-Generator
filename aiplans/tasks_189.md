# Tasks — Plan 189 (`get_marker_info`)

- [x] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err.
- [x] Baseline: `npm test 2>&1 | tail -5` → 200 files / 2708 tests.
- [x] Read reference files: `list-markers.ts`, `set-marker-type.ts`,
  `set-marker-icon.ts`, `set-marker-colors.ts`, `set-marker-pin.ts`,
  `set-marker-note.ts` (+ `findMarkerNoteRef`), `add-marker.ts`,
  `get-state-info{.ts,.test.ts}`, `get-province-info{.ts,.test.ts}`,
  `get-river-info.ts`, `_shared/index.ts`, `_shared/pack-types.ts`,
  `_shared/entity-ref.ts`, `_shared/find-entity.ts`.
- [ ] Write `src/ai/tools/get-marker-info.ts` with:
  - `MarkerInfo` interface covering all resolved fields
    (`colors`, `note` sub-objects included).
  - `readMarkerInfoFromPack(pack, notes, ref)` pure helper returning
    `MarkerInfo | "not-ready" | "not-found"`. Uses `findMarkerNoteRef`
    for ref resolution so string refs match marker-note names.
  - `MarkerInfoRuntime` + `defaultMarkerInfoRuntime` reading
    `globalThis.pack` + `globalThis.notes` via `getPack` / `getNotes`.
  - `createGetMarkerInfoTool(runtime)` and exported `getMarkerInfoTool`.
  - Tool schema: `marker` (integer or string, required); description
    references the resolved fields + API-key note.
  - Truncates legends > 2000 chars with a `…` and
    `legend_truncated: true` flag.
- [ ] Write `src/ai/tools/get-marker-info.test.ts`:
  - Seam-block tests (fake pack / notes) covering the plan cases.
  - `defaultMarkerInfoRuntime` integration block using
    `(globalThis as unknown as { pack?: …; notes?: … })` writes +
    `afterEach` restores.
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block +
  a single `registry.register(getMarkerInfoTool);` next to
  `registry.register(getRiverInfoTool);`.
- [ ] Add a README_AI.md row after the `get_province_info` row —
  description with API-key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` — must pass, test count grows by N cases.
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add get_marker_info tool` staging only the
  plan, tasks, tool file, test file, `index.ts`, and `README_AI.md`.
