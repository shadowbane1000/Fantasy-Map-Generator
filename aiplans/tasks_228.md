# Tasks 228: `find_religions_by_type`

## Study
- [x] Read `src/ai/tools/find-states-by-type.ts` + test (closest analog — enum type validation).
- [x] Read `src/ai/tools/find-cultures-by-type.ts` + test (another analog — culture lookup for names).
- [x] Read `src/ai/tools/set-religion-type.ts` (exports `RELIGION_TYPES`, `resolveReligionType`, `ReligionType`).
- [x] Read `src/ai/tools/list-religions.ts` (shape of religion summaries — name/type/form/deity/color/culture).
- [x] Read `src/ai/tools/_shared/index.ts` (helpers: `errorResult`, `getPack`, `okResult`, `RawReligion`, `RawCulture`).

## Write runtime file
- [ ] `src/ai/tools/find-religions-by-type.ts`:
  - Constants: `DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT = 10000`, `MAX_FIND_RELIGIONS_BY_TYPE_LIMIT = 100000`.
  - Types: `FindReligionsByTypeHit { i, name, color, form, deity, culture }`, `FindReligionsByTypePayload { type, religions, count }`, `FindReligionsByTypeResult = Payload | "not-ready"`, `FindReligionsByTypeRuntime { find(type, limit) }`.
  - `PackLike` with `religions?: RawReligion[]; cultures?: RawCulture[]`.
  - Pure scanner `findReligionsByTypeInPack(pack, type: ReligionType, limit)`:
    - Returns `"not-ready"` when `!pack?.religions`.
    - Iterates; skips `r.i === 0`, `removed`, non-string type, case-insensitive mismatch.
    - Looks up culture name via `pack.cultures?.[r.culture]?.name`; falls back to `null` when culture missing / removed / culture=0.
    - Counts total regardless of cap.
  - `defaultFindReligionsByTypeRuntime` calling `findReligionsByTypeInPack(getPack<PackLike>(), type, limit)`.
  - `parseLimit(value)`: returns `number` or error string (identical shape to siblings).
  - `createFindReligionsByTypeTool(runtime)`:
    - Uses `resolveReligionType` / `RELIGION_TYPES` from `./set-religion-type`.
    - Schema: `type` required string, `limit` optional integer [1, MAX].
    - Validation order: `type` required → string → non-empty → resolve canonical (reject unknown with `supported: [...RELIGION_TYPES]`) → parse limit → call runtime → not-ready surface.
    - Returns `okResult({ type: result.type, religions, count })`.
  - `findReligionsByTypeTool = createFindReligionsByTypeTool()`.

## Write test file
- [ ] `src/ai/tools/find-religions-by-type.test.ts`:
  - `FakePack` fixture with religions of various types including index-0 placeholder, removed, no-type, lowercase type (still matches), and culture references (some valid, some missing, some 0).
  - `asPack(p)` cast via `as unknown as Parameters<typeof findReligionsByTypeInPack>[0]`.
  - Pure-scanner tests: case-insensitive match, second-type no cross-contamination, empty when no match, skips i=0/removed/no-type, truncation with full count, populates all fields, null fallbacks (color/form/deity/culture), not-ready when pack / religions missing.
  - Tool-surface tests: ok true, case-insensitive + echoes canonical, rejects missing/non-string/empty, rejects unknown type with supported list, not-ready surfaces as error, explicit limit, invalid limit, default limit when omitted, limit boundaries, empty when no matches, exported tool shape, constants.
  - Integration block with `beforeEach`/`afterEach` swapping `globalThis.pack`, using `as unknown as { pack?: unknown }` cast. Covers: default runtime with Folk, tool end-to-end with Organized, not-ready when pack missing.

## Register & document
- [ ] Import `findReligionsByTypeTool` in `src/ai/index.ts` (adjacent to `findReligionsByCultureTool`).
- [ ] Add re-export block adjacent to `find-religions-by-culture`.
- [ ] `registry.register(findReligionsByTypeTool)` after `findReligionsByCultureTool` / `findCulturesByTypeTool`.
- [ ] Add README_AI.md row next to `find_cultures_by_type` with the "Anthropic API key" note and natural-language examples.

## Verify
- [ ] `npm run lint` — match baseline (7 warnings / 1 info / 0 errors).
- [ ] `npm run build` — clean.
- [ ] `npm test` — new tests added and all pass.

## Commit
- [ ] Stage the 4 files (`plan_228.md`, `tasks_228.md`, `find-religions-by-type.ts`, `find-religions-by-type.test.ts`, `src/ai/index.ts`, `README_AI.md`).
- [ ] Commit: `feat(ai): add find_religions_by_type tool`.
