# Tasks 221 — `find_rivers_in_area`

- [ ] Implement `src/ai/tools/find-rivers-in-area.ts`:
  - [ ] Constants `DEFAULT_FIND_RIVERS_IN_AREA_LIMIT = 10000`,
        `MAX_FIND_RIVERS_IN_AREA_LIMIT = 100000`.
  - [ ] Types: `FindRiversInAreaHit`, `FindRiversInAreaArea`,
        `FindRiversInAreaPayload`, `FindRiversInAreaQuery` (rect /
        circle-coords / circle-cell), `FindRiversInAreaResult`.
  - [ ] Pure scanner `findRiversInAreaInPack(pack, query)` — resolves
        area, iterates `pack.rivers`, reads mouth via
        `pack.cells.p[river.mouth]`, collects hits, enforces `limit`
        but still increments the unlimited `count`.
  - [ ] `resolveCircleCenter` helper (same four outcomes as the analog
        tools).
  - [ ] `FindRiversInAreaRuntime` + `defaultFindRiversInAreaRuntime`
        pulling `pack` from globals.
  - [ ] `createFindRiversInAreaTool(runtime?)` factory +
        `findRiversInAreaTool` singleton. Description mirrors
        `find_markers_in_area` but explicitly calls out the mouth-
        based position and points to `find_nearest_river` for source
        proximity; ends with the API-key sentence.
  - [ ] Input validation mirrors `find_markers_in_area` minus the
        `type` filter.
- [ ] Write `src/ai/tools/find-rivers-in-area.test.ts` covering:
  - [ ] Pure scanner: rect inclusive edges, reversed corners, rect
        `distance === null`; circle-coords + distance populated;
        circle-cell resolves via `pack.cells.p[cell]`; radius 0;
        `limit` truncation vs `count`; skips removed / mouth-less /
        index-0 rivers; empty result; `"not-ready"`; circle-cell
        `"out-of-bounds"` and `"no-cell-point"`.
  - [ ] Tool surface: reject missing area, mixed area, incomplete
        rect, non-finite rect, mixed circle center, missing circle
        center, missing x or y, non-finite x / y, non-integer /
        negative cell, missing / non-finite / negative radius, out-of-
        range limit; accept radius 0; surface `"not-ready"` /
        `"out-of-bounds"` / `"no-cell-point"`; happy-path rect + circle
        responses; end-to-end limit honoring; schema shape + exported
        constants.
  - [ ] `defaultFindRiversInAreaRuntime` integration: stub
        `globalThis.pack` via
        `globalThis as unknown as { pack?: unknown }`, assert rect +
        circle-coords + circle-cell read the global, and that
        `pack = undefined` surfaces `"not-ready"` end-to-end.
- [ ] Register `findRiversInAreaTool` in `src/ai/index.ts`:
  - [ ] Import next to `findMarkersInAreaTool`.
  - [ ] Export block next to `find-markers-in-area` exports.
  - [ ] `registry.register(findRiversInAreaTool)` right after
        `findNearestRiverTool` in `buildDefaultRegistry`.
- [ ] Add a row to `README_AI.md` between `find_nearest_river` and
      `list_biomes` / `list_features`:
  - [ ] Describe area forms, mouth-based position, `limit`, error
        modes, mouth vs. source note + pointer to `find_nearest_river`.
  - [ ] End with "Requires an Anthropic API key (see 'Getting an API
        key' below)."
  - [ ] Sample prompts with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` — all tests pass, new tests included.
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0
        errors).
- [ ] Commit `feat(ai): add find_rivers_in_area tool` with a 1-2 line
      body. Stage specific files (tool source, test, `src/ai/index.ts`,
      `README_AI.md`, `aiplans/plan_221.md`, `aiplans/tasks_221.md`).
