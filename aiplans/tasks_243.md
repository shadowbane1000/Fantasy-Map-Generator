# Tasks 243 — `find_regiments_by_type`

- [ ] Implement `src/ai/tools/find-regiments-by-type.ts`
  - [ ] Export constants `DEFAULT_FIND_REGIMENTS_BY_TYPE_LIMIT` (10000)
        and `MAX_FIND_REGIMENTS_BY_TYPE_LIMIT` (100000).
  - [ ] `findRegimentsByTypeInPack(pack, type, limit)` pure scanner —
        iterates `pack.states` (skips i=0 Neutrals + `removed: true`),
        then each state's `military`, filters by
        `regiment.type?.toLowerCase() === type`.
  - [ ] `FindRegimentsByTypeRuntime` interface +
        `defaultFindRegimentsByTypeRuntime` that reads `pack` from
        globals via `getPack`.
  - [ ] `createFindRegimentsByTypeTool(runtime?)` factory +
        `findRegimentsByTypeTool` singleton.
  - [ ] Runtime validation for `type` (required, non-string rejected,
        empty/whitespace rejected) and `limit`.
  - [ ] Map `"not-ready"` to `errorResult`.
  - [ ] Per-hit shape:
        `{ state: { i, name }, i, name, icon, x, y, cell, n, naval }`.
- [ ] Write `src/ai/tools/find-regiments-by-type.test.ts` with three
      describe blocks:
  - [ ] Pure scanner (multi-state match, case-insensitive,
        skips Neutrals + removed states, skips null/no-i regiments,
        naval/icon/x/y/cell/n fallbacks, limit/count, not-ready).
  - [ ] Tool surface (happy path, case-insensitive + trim, invalid
        type variants, not-ready, limit variants, default limit,
        schema shape, constants).
  - [ ] `defaultFindRegimentsByTypeRuntime` integration (stub
        `globalThis.pack`, assert via `as unknown as { pack?: unknown }`).
- [ ] Register `findRegimentsByTypeTool` in `src/ai/index.ts`:
  - [ ] Import next to `findRegimentsByStateTool`.
  - [ ] Add export block for the tool's public API.
  - [ ] `registry.register(findRegimentsByTypeTool)` in
        `buildDefaultRegistry` next to `findRegimentsByStateTool`.
- [ ] Add README_AI.md row near `find_regiments_by_state`:
  - [ ] Description includes `type` input (any string,
        case-insensitive), `limit`, error modes, typical usage,
        parallel to `list_regiments` / `find_regiments_by_state` /
        `get_regiment_info`.
  - [ ] Ends with "Requires an Anthropic API key (see 'Getting an API
        key' below)."
  - [ ] Sample prompts column with 2-3 examples.
- [ ] Verify:
  - [ ] `npm run build` succeeds.
  - [ ] `npm test` all pass (new tests included).
  - [ ] `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit with message `feat(ai): add find_regiments_by_type tool`
      + 1-2 line body.
