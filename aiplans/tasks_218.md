# Tasks 218 — `find_regiments_by_state`

- [ ] Implement `src/ai/tools/find-regiments-by-state.ts`
  - [ ] Export constants `DEFAULT_FIND_REGIMENTS_BY_STATE_LIMIT` (10000)
        and `MAX_FIND_REGIMENTS_BY_STATE_LIMIT` (100000).
  - [ ] `findRegimentsByStateInPack(pack, stateI, limit)` pure scanner —
        resolves `pack.states[stateI]`, iterates its `military` array.
  - [ ] `resolveStateRefInPack(pack, ref)` helper returning
        `{ i, name } | "not-ready" | "not-found" | "neutral"` using
        shared `findEntityByRef`.
  - [ ] `FindRegimentsByStateRuntime` interface +
        `defaultFindRegimentsByStateRuntime` that reads `pack` from
        globals.
  - [ ] `createFindRegimentsByStateTool(runtime?)` factory +
        `findRegimentsByStateTool` singleton.
  - [ ] Runtime validation for `state` (via `parseEntityRef`, with
        explicit 0-Neutrals check) and `limit`.
  - [ ] Map `"not-ready"` / `"not-found"` / `"neutral"` to `errorResult`.
- [ ] Write `src/ai/tools/find-regiments-by-state.test.ts` with three
      describe blocks:
  - [ ] Pure scanner (happy, empty military, limit/count, not-ready,
        icon / type / cell / x / y / n / naval handling).
  - [ ] Tool surface (happy numeric + string, invalid state, state=0,
        not-found, not-ready, limit variants, default limit, schema
        shape, constants).
  - [ ] `defaultFindRegimentsByStateRuntime` integration (stub
        `globalThis.pack`, assert via `as unknown as { pack?: unknown }`).
- [ ] Register `findRegimentsByStateTool` in `src/ai/index.ts`:
  - [ ] Import next to `findProvincesByStateTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findRegimentsByStateTool)` in
        `buildDefaultRegistry` next to `findProvincesByStateTool`.
- [ ] Add README_AI.md row near `find_provinces_by_state`:
  - [ ] Description includes `state` input, `limit`, error modes,
        typical usage, parallel to `list_regiments` / `get_state_info` /
        `find_provinces_by_state`.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API
        key' below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass (new tests included).
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message `feat(ai): add find_regiments_by_state tool`
      + 1-2 line body.
