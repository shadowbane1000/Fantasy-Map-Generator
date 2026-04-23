# Tasks — Plan 216 (`find_burgs_by_culture`)

- [ ] 1. Create `src/ai/tools/find-burgs-by-culture.ts` copying the structure of `find-burgs-by-state.ts`:
  - [ ] Constants `DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT = 10000`, `MAX_FIND_BURGS_BY_CULTURE_LIMIT = 100000`.
  - [ ] Exported types `FindBurgsByCultureHit`, `FindBurgsByCulturePayload`, `FindBurgsByCultureResult`, `ResolvedCulture`, `ResolveCultureResult`, `FindBurgsByCultureRuntime`.
  - [ ] `resolveCultureRefInPack(pack, ref)` — mirrors `findCultureByRef` in `get-culture-info.ts` (allows id 0); returns `"not-ready" | "not-found" | {i, name}`.
  - [ ] `findBurgsByCultureInPack(pack, cultureI, limit)` — iterate pack.burgs, skip i=0 / removed, filter `b.culture === cultureI`, cap at limit but count full total.
  - [ ] `defaultFindBurgsByCultureRuntime` uses `getPack<PackLike>()`.
  - [ ] `parseLimit` shared pattern; `parseCultureRef` allowing `value >= 0`.
  - [ ] `createFindBurgsByCultureTool(runtime)` + `findBurgsByCultureTool` exported.
  - [ ] Description text parallels the state tool's, calls out Wildlands allowed, mentions Anthropic API key requirement.

- [ ] 2. Create `src/ai/tools/find-burgs-by-culture.test.ts` mirroring the state test, using `as unknown as {...}` casts:
  - [ ] `makePack` fixture with cultures (0 Wildlands, 1, 2, 3 removed) and burgs including placeholder, removed, and no-culture entries.
  - [ ] Pure scanner block: multi-culture, no-cross-contamination, empty culture, skip i=0 & removed, limit truncation, field population, not-ready on missing pack / missing burgs.
  - [ ] `resolveCultureRefInPack` block: numeric id, case-insensitive name, id 0 allowed, not-found unknown name, not-found removed id, not-ready missing.
  - [ ] Tool-surface block: ok numeric, ok string, ok id 0, rejects invalid inputs, not-found, not-ready (both seams), explicit limit + count, invalid limit, default limit, empty list, exported schema shape, constants exported.
  - [ ] `defaultFindBurgsByCultureRuntime` integration block using `globalThis.pack`.

- [ ] 3. Register in `src/ai/index.ts`:
  - [ ] Add import after the `findBurgsByStateTool` import (alphabetical-ish — fits fine after).
  - [ ] Add re-export block next to the state tool block.
  - [ ] Call `registry.register(findBurgsByCultureTool)` next to the state registration line.

- [ ] 4. Add a README_AI.md row directly after the `find_burgs_by_state` row.

- [ ] 5. `npm run build` — must succeed.

- [ ] 6. `npm test` — all tests pass; count grows from 3307.

- [ ] 7. `npm run lint` — 7 warnings / 1 info / 0 errors (unchanged baseline).

- [ ] 8. Commit with `feat(ai): add find_burgs_by_culture tool` and staged files only.
