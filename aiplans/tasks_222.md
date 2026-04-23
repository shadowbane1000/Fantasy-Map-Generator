# Tasks 222 — `find_markers_by_type`

- [ ] Implement `src/ai/tools/find-markers-by-type.ts`:
  - [ ] Constants `DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT = 10000`,
        `MAX_FIND_MARKERS_BY_TYPE_LIMIT = 100000`.
  - [ ] Types: `FindMarkersByTypeHit`, `FindMarkersByTypePayload`,
        `FindMarkersByTypeQuery`, `FindMarkersByTypeResult`.
  - [ ] Pure scanner `findMarkersByTypeInPack(pack, query)` — iterates
        `pack.markers`, skips `i === 0` / removed / null entries,
        matches the typed filter case-insensitively OR the `"untyped"`
        sentinel (missing / empty / non-string / whitespace type),
        collects hits, enforces `limit` but still increments the
        unlimited `count`.
  - [ ] `FindMarkersByTypeRuntime` + `defaultFindMarkersByTypeRuntime`
        pulling `pack` from globals via `getPack`.
  - [ ] `createFindMarkersByTypeTool(runtime?)` factory +
        `findMarkersByTypeTool` singleton. Description mirrors
        `find_markers_in_area` minus the area language, explains the
        `"untyped"` sentinel, and ends with the API-key sentence.
  - [ ] Input validation: `type` required (string); any whitespace-
        only / empty / `"untyped"` / `"UNTYPED"` normalises to the
        untyped sentinel. `limit` integer in `[1, 100000]`.
- [ ] Write `src/ai/tools/find-markers-by-type.test.ts` covering:
  - [ ] Pure scanner: case-insensitive match, original-casing
        preserved in hit `type`, `"untyped"` bucket catches missing /
        non-string / empty / whitespace types with `type: null`, skips
        removed / `i === 0` / null entries, `limit` truncation vs
        `count`, empty result, `"not-ready"`.
  - [ ] Tool surface: rejects missing / non-string `type`; empty and
        whitespace-only strings and the literal `"untyped"` /
        `"UNTYPED"` are accepted as the untyped bucket. Rejects out-of-
        range `limit` (0, > MAX, non-integer, non-number, negative).
        Accepts `limit` at the boundaries. Surfaces `"not-ready"`
        end-to-end. Happy-path returns `{ok, type, markers, count}`.
        End-to-end `limit` honoring. Schema shape + exported constants.
  - [ ] `defaultFindMarkersByTypeRuntime` integration: stub
        `globalThis.pack` via
        `globalThis as unknown as { pack?: unknown }`, assert typed and
        `"untyped"` queries both read the live pack, and that
        `pack = undefined` surfaces `"not-ready"` end-to-end.
- [ ] Register `findMarkersByTypeTool` in `src/ai/index.ts`:
  - [ ] Import next to `findMarkersInAreaTool`.
  - [ ] Export block next to `find-markers-in-area` exports.
  - [ ] `registry.register(findMarkersByTypeTool)` right after
        `findMarkersInAreaTool` in `buildDefaultRegistry`.
- [ ] Add a row to `README_AI.md` between `find_markers_in_area` and
      `list_rulers`:
  - [ ] Describe exact-type matching, the `"untyped"` sentinel,
        `limit`, response shape, and error modes.
  - [ ] End with "Requires an Anthropic API key (see 'Getting an API
        key' below)."
  - [ ] Sample prompts with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` — all tests pass, new tests included.
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0
        errors).
- [ ] Commit `feat(ai): add find_markers_by_type tool` with a 1-2 line
      body. Stage specific files (tool source, test, `src/ai/index.ts`,
      `README_AI.md`, `aiplans/plan_222.md`, `aiplans/tasks_222.md`).
