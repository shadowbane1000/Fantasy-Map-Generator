# Tasks — Plan 219 (`find_burgs_by_religion`)

- [ ] 1. Create `src/ai/tools/find-burgs-by-religion.ts` copying the structure of `find-burgs-by-culture.ts`:
  - [ ] Constants `DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT = 10000`, `MAX_FIND_BURGS_BY_RELIGION_LIMIT = 100000`.
  - [ ] Exported types `FindBurgsByReligionHit`, `FindBurgsByReligionPayload`, `FindBurgsByReligionResult`, `ResolvedReligion`, `ResolveReligionResult`, `FindBurgsByReligionRuntime`.
  - [ ] `resolveReligionRefInPack(pack, ref)` — allows id 0, rejects removed / out-of-range / unknown-name; returns `"not-ready" | "not-found" | {i, name}`.
  - [ ] `findBurgsByReligionInPack(pack, religionI, limit)` — iterate `pack.burgs`, skip `i===0` / `removed`, match via `pack.cells.religion[b.cell]`, cap at limit but count full total. Return `"not-ready"` if `pack.burgs` or `pack.cells.religion` is missing.
  - [ ] `defaultFindBurgsByReligionRuntime` uses `getPack<PackLike>()`.
  - [ ] `parseLimit` standard pattern; `parseReligionRef` allows `value >= 0`.
  - [ ] `createFindBurgsByReligionTool(runtime)` + `findBurgsByReligionTool` exported.
  - [ ] Description mentions cell-indirection match, religion 0 allowed, Anthropic API key requirement.

- [ ] 2. Create `src/ai/tools/find-burgs-by-religion.test.ts` mirroring the culture test:
  - [ ] `makePack` fixture with religions (0 "No religion", 1, 2, 3 removed) and burgs including placeholder, removed, and orphan entries. Include `cells.religion` array.
  - [ ] Pure scanner block: multi-religion, no-cross-contamination, religion 0, empty religion, skip i=0 & removed, out-of-bounds cell handling, limit truncation, field population, not-ready on missing pack / missing burgs / missing cells.religion.
  - [ ] `resolveReligionRefInPack` block: numeric id, case-insensitive name, id 0 allowed, not-found unknown name, not-found removed id, not-found out-of-range, not-ready missing.
  - [ ] Tool-surface block: ok numeric, ok string, ok id 0, rejects invalid inputs, not-found, not-ready (both seams), explicit limit + count, invalid limit, default limit, empty list, exported schema shape, constants exported.
  - [ ] `defaultFindBurgsByReligionRuntime` integration block using `globalThis.pack` with `as unknown as { ... }` casts.

- [ ] 3. Register in `src/ai/index.ts`:
  - [ ] Add import between `findBurgsByCultureTool` and `findBurgsByStateTool` (alphabetical).
  - [ ] Add re-export block in alphabetical position.
  - [ ] Call `registry.register(findBurgsByReligionTool)` next to the other find-burgs-by registrations.

- [ ] 4. Add a README_AI.md row directly after the `find_burgs_by_culture` row, matching the existing style and mentioning the Anthropic API key.

- [ ] 5. `npm run build` — must succeed.

- [ ] 6. `npm test` — all tests pass; count grows from 3377.

- [ ] 7. `npm run lint` — 7 warnings / 1 info / 0 errors (unchanged baseline).

- [ ] 8. Commit with `feat(ai): add find_burgs_by_religion tool` and staged files only.
