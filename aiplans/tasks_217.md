# Tasks 217 — `find_provinces_by_state`

- [ ] Implement `src/ai/tools/find-provinces-by-state.ts`
  - [ ] Export constants `DEFAULT_FIND_PROVINCES_BY_STATE_LIMIT` (10000)
        and `MAX_FIND_PROVINCES_BY_STATE_LIMIT` (100000).
  - [ ] `findProvincesByStateInPack(pack, stateI, limit)` pure scanner —
        iterates `pack.provinces`, skips index-0 / removed /
        non-matching-state.
  - [ ] `resolveStateRefInPack(pack, ref)` helper returning
        `{ i, name } | "not-ready" | "not-found" | "neutral"` using
        shared `findEntityByRef`.
  - [ ] `FindProvincesByStateRuntime` interface +
        `defaultFindProvincesByStateRuntime` that reads `pack` from
        globals.
  - [ ] `createFindProvincesByStateTool(runtime?)` factory +
        `findProvincesByStateTool` singleton.
  - [ ] Runtime validation for `state` (via `parseEntityRef`, with
        explicit 0-Neutrals check) and `limit`.
  - [ ] Map `"not-ready"` / `"not-found"` / `"neutral"` to `errorResult`.
- [ ] Write `src/ai/tools/find-provinces-by-state.test.ts` with three
      describe blocks:
  - [ ] Pure scanner (happy, skip placeholder / removed, empty state,
        limit/count, not-ready, center / fullName / formName / color
        handling).
  - [ ] Tool surface (happy numeric + string, invalid state, state=0,
        not-found, not-ready, limit variants, default limit, schema
        shape, constants).
  - [ ] `defaultFindProvincesByStateRuntime` integration (stub
        `globalThis.pack`, assert via `as unknown as { pack?: unknown }`).
- [ ] Register `findProvincesByStateTool` in `src/ai/index.ts`:
  - [ ] Import next to `findBurgsByStateTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findProvincesByStateTool)` in
        `buildDefaultRegistry` next to `findBurgsByStateTool`.
- [ ] Add README_AI.md row near `find_burgs_by_state`:
  - [ ] Description includes `state` input, `limit`, error modes,
        typical usage, parallel to `list_provinces` / `get_state_info` /
        `find_burgs_by_state`.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API
        key' below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass (new tests included).
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message `feat(ai): add find_provinces_by_state tool`
      + 1-2 line body.
