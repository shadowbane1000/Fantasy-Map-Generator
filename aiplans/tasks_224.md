# Tasks 224 — `find_burgs_by_type`

- [ ] Write `src/ai/tools/find-burgs-by-type.ts`:
  - Re-use `BURG_TYPES` + `resolveBurgType` (do NOT duplicate).
  - Pure `findBurgsByTypeInPack` scanner.
  - `defaultFindBurgsByTypeRuntime`.
  - `createFindBurgsByTypeTool` + `findBurgsByTypeTool`.
  - Errors: type required / non-string / empty / unknown, invalid limit, not-ready.
- [ ] Write `src/ai/tools/find-burgs-by-type.test.ts`:
  - Pure scanner: matches by type (case-insensitive), skips i=0/removed, limit truncation preserves count, populates x/y/name/population/capital, not-ready.
  - Tool surface: reject missing/empty/non-string/unknown type, accept case-variant inputs, echo `type` as canonical, limit bounds, `not-ready` surfacing.
  - `defaultFindBurgsByTypeRuntime` integration (install/remove `globalThis.pack`).
- [ ] Register in `src/ai/index.ts` (import, named exports, `registry.register`).
- [ ] Add row in README_AI.md after `find_burgs_by_religion`.
- [ ] `npm run build` + `npm test` + lint baseline.
- [ ] Commit with `feat(ai): add find_burgs_by_type tool`.
