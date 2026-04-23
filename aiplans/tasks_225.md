# Tasks 225 — `find_zones_by_type`

- [ ] Implement `src/ai/tools/find-zones-by-type.ts`:
  - [ ] Constants `DEFAULT_FIND_ZONES_BY_TYPE_LIMIT = 10000`,
        `MAX_FIND_ZONES_BY_TYPE_LIMIT = 100000`.
  - [ ] Types: `FindZonesByTypeHit`, `FindZonesByTypePayload`,
        `FindZonesByTypeQuery`, `FindZonesByTypeResult`,
        `FindZonesByTypeRuntime`.
  - [ ] Pure scanner `findZonesByTypeInPack(pack, query)` — iterates
        `pack.zones`, skips removed / null entries, matches the typed
        filter case-insensitively, collects hits, enforces `limit` but
        still increments the unlimited `count`. Includes `zone.i === 0`
        (zones have non-contiguous ids starting at 0).
  - [ ] `FindZonesByTypeRuntime` + `defaultFindZonesByTypeRuntime`
        pulling `pack` from globals via `getPack<ZonePackLike>()`.
  - [ ] `createFindZonesByTypeTool(runtime?)` factory +
        `findZonesByTypeTool` singleton. Description mirrors
        `find_markers_by_type` pattern, explains the common zone types
        (Invasion, Rebels, Crusade, Disease, etc.), and ends with the
        API-key sentence.
  - [ ] Input validation: `type` required (non-empty string). `limit`
        integer in `[1, 100000]`.
- [ ] Write `src/ai/tools/find-zones-by-type.test.ts` covering:
  - [ ] Pure scanner: case-insensitive match, original-casing
        preserved in hit `type`, skips removed / null entries,
        includes `zone.i === 0`, `cells_count` reports array length
        (or 0 when missing / non-array), `limit` truncation vs
        `count`, empty result, `"not-ready"`.
  - [ ] Tool surface: rejects missing / non-string / empty /
        whitespace-only `type`. Rejects out-of-range `limit` (0, > MAX,
        non-integer, non-number, negative, NaN). Accepts `limit` at the
        boundaries. Surfaces `"not-ready"` end-to-end. Happy-path
        returns `{ok, type, zones, count}`. End-to-end `limit` honoring.
        Schema shape + exported constants.
  - [ ] `defaultFindZonesByTypeRuntime` integration: stub
        `globalThis.pack` via
        `globalThis as unknown as { pack?: unknown }`, assert typed
        query reads the live pack, and that `pack = undefined` surfaces
        `"not-ready"` end-to-end.
- [ ] Register `findZonesByTypeTool` in `src/ai/index.ts`:
  - [ ] Import alphabetically near the `find-*` imports.
  - [ ] Export block alphabetically near `find-states-by-culture`.
  - [ ] `registry.register(findZonesByTypeTool)` near `listZonesTool`
        in `buildDefaultRegistry`.
- [ ] Add a row to `README_AI.md` near `list_zones` / `get_zone_info`:
  - [ ] Describe exact-type matching, `limit`, response shape, and
        error modes.
  - [ ] End with "Requires an Anthropic API key (see 'Getting an API
        key' below)."
  - [ ] Sample prompts with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` — all tests pass, new tests included.
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0
        errors).
- [ ] Commit `feat(ai): add find_zones_by_type tool` with a 1-2 line
      body. Stage specific files (tool source, test, `src/ai/index.ts`,
      `README_AI.md`, `aiplans/plan_225.md`, `aiplans/tasks_225.md`).
