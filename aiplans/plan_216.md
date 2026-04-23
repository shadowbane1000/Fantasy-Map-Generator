# Plan 216 — `find_burgs_by_culture` AI tool

## Goal
Add a read-only AI tool that lists every active burg belonging to a given culture. It is the culture-filtered parallel of `list_burgs` and the bulk counterpart of `get_culture_info`'s `burgs_count` field — just like `find_burgs_by_state` is to states.

## Shape
- File: `src/ai/tools/find-burgs-by-culture.ts`
- Test: `src/ai/tools/find-burgs-by-culture.test.ts`
- Register in `src/ai/index.ts` (import + re-exports + `registry.register`).
- Add README_AI.md row adjacent to `find_burgs_by_state`.

## Tool contract
- name: `find_burgs_by_culture`
- input:
  - `culture` (integer | string, required) — numeric id `>= 0` (0 = Wildlands is allowed) or case-insensitive `name`.
  - `limit` (integer, 1..100000, default 10000).
- output: `{ ok, culture: {i, name}, burgs: [{i, name, x, y, population, capital}], count }`.
- read-only — no pack mutation.

## Key differences from `find_burgs_by_state`
- Culture 0 (Wildlands) IS allowed (parallels `get_culture_info`).
- No `fullName` lookup for cultures (cultures don't have `fullName`).
- Resolution must NOT skip id 0 the way `findEntityByRef` does.
- We reuse the same culture resolver approach seen in `get-culture-info.ts` (`findCultureByRef`, which accepts ref >= 0).
- Culture ref parser accepts `value >= 0` (non-negative integer) — parallel to `parseCultureRef` in `get-culture-info.ts`.
- Burg-to-culture match: `burg.culture === cultureI` (direct field, same as `find-burgs-by-state` uses `burg.state`). No cell-based fallback — `find-burgs-by-state` doesn't do one either, and the generator stamps `burg.culture` directly.

## Implementation sketch
Copy structure from `find-burgs-by-state.ts`:
- Constants: `DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT = 10000`, `MAX_FIND_BURGS_BY_CULTURE_LIMIT = 100000`.
- Types: `FindBurgsByCultureHit`, `FindBurgsByCulturePayload`, `FindBurgsByCultureResult`, `ResolvedCulture`, `ResolveCultureResult`, `PackLike`, `FindBurgsByCultureRuntime`.
- `resolveCultureRefInPack(pack, ref)` — returns `ResolvedCulture | "not-ready" | "not-found"`. No `"neutral"` branch — culture 0 is readable.
- `findBurgsByCultureInPack(pack, cultureI, limit)` — iterate `pack.burgs`, skip i=0 / removed, filter `b.culture === cultureI`, cap output at limit but still increment `count`.
- `defaultFindBurgsByCultureRuntime` — reads pack via `getPack`.
- `createFindBurgsByCultureTool(runtime)` — wires parsing + runtime, returns `Tool`.
- `findBurgsByCultureTool` — default export instance.
- `parseLimit` reused pattern.
- `parseCultureRef` uses `value >= 0` (mirror `get-culture-info.ts`) instead of `parseEntityRef`.

## Tests
Mirror `find-burgs-by-state.test.ts`:
- pure scanner: multi-burg culture, second culture, empty culture, skip i=0 / removed, limit truncation, field population, not-ready.
- `resolveCultureRefInPack`: numeric id, case-insensitive name, id 0 allowed, not-found unknown, not-found removed, not-ready missing pack.
- tool surface: ok numeric, string name, id 0 (Wildlands) — ok, missing/invalid culture → error with expected message, not-found surfaced, not-ready (both seams), explicit limit, invalid limit, default limit, empty list, exported tool schema has `culture` required, constants exported.
- `defaultFindBurgsByCultureRuntime` integration — set `globalThis.pack`, verify resolve + find + end-to-end tool.

## Verification
- `npm run build` succeeds.
- `npm test` all 3307 + new tests pass.
- `npm run lint` stays at 7 warnings / 1 info / 0 errors.

## Registry + docs
- Import `findBurgsByCultureTool` in `src/ai/index.ts`.
- Export its symbols next to the `find_burgs_by_state` export block.
- Register via `registry.register(findBurgsByCultureTool)` adjacent to `findBurgsByStateTool`.
- Add README_AI.md row right after `find_burgs_by_state`.
