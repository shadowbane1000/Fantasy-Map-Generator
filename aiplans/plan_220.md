# Plan 220 — `find_states_by_culture` AI tool

## Goal
Add a read-only AI tool that lists every active state whose dominant culture is a given culture — the culture-filtered parallel of `list_states` and the bulk counterpart to `get_culture_info`'s `states_count` field (which reports the count but not the list). This is the states-shaped analog of `find_burgs_by_culture`.

## Shape
- File: `src/ai/tools/find-states-by-culture.ts`
- Test: `src/ai/tools/find-states-by-culture.test.ts`
- Register in `src/ai/index.ts` (import + re-exports + `registry.register`).
- Add README_AI.md row adjacent to `find_burgs_by_culture`.

## Tool contract
- name: `find_states_by_culture`
- input:
  - `culture` (integer | string, required) — numeric id `>= 0` (id 0 = Wildlands is allowed) or case-insensitive `name`.
  - `limit` (integer, 1..100000, default 10000).
- output: `{ ok, culture: {i, name}, states: [{i, name, fullName, form, color, capital}], count }`.
  - `fullName`, `form`, `color` fall back to `null` when missing.
  - `capital` is the capital burg's **name** (string) or `null` — matches the shape `list_states` uses. Looked up via `pack.burgs[state.capital]?.name` when `state.capital > 0`.
- read-only — no pack mutation.

## Key notes
- **State 0 (Neutrals) is always skipped** when scanning, but the target culture id 0 (Wildlands) is perfectly valid as an input — Neutrals sometimes carries culture 0, and even if a Neutrals entry matched it would be skipped because `state.i === 0`.
- Cultures don't carry `fullName`, so resolution is by `name` only (reuse the same `resolveCultureRefInPack` pattern as `find-burgs-by-culture.ts`).
- Match: `state.culture === cultureI` (direct field, same source `get_culture_info` uses for its `states_count` scan).

## Implementation sketch
Closest analog: `find-burgs-by-culture.ts` for the culture-ref resolution shape, plus `find-provinces-by-state.ts` for the "return a list of states" shape (adjusted — we return states, not provinces, and the parent ref is a culture not a state).

- Constants: `DEFAULT_FIND_STATES_BY_CULTURE_LIMIT = 10000`, `MAX_FIND_STATES_BY_CULTURE_LIMIT = 100000`.
- Types:
  - `FindStatesByCultureHit = { i, name, fullName: string | null, form: string | null, color: string | null, capital: string | null }`
  - `FindStatesByCulturePayload = { states: Hit[], count }`
  - `FindStatesByCultureResult = Payload | "not-ready"`
  - `ResolvedCulture = { i, name }`
  - `ResolveCultureResult = ResolvedCulture | "not-ready" | "not-found"`
  - `FindStatesByCultureRuntime`
  - `PackLike` — `{ states?: RawState[]; cultures?: RawCulture[]; burgs?: RawBurg[] }`
- `resolveCultureRefInPack(pack, ref)` — mirrors the function in `find-burgs-by-culture.ts` exactly (allows id 0, case-insensitive name, skips `removed`).
- `findStatesByCultureInPack(pack, cultureI, limit)` — iterate `pack.states`, skip `i === 0` (Neutrals) / `removed`, filter on `state.culture === cultureI`. Resolve capital name via `pack.burgs[state.capital]?.name` (when `state.capital > 0`). Cap output at limit, still increment `count`. Returns `"not-ready"` if `pack.states` is missing.
- `defaultFindStatesByCultureRuntime` — reads pack via `getPack<PackLike>()`.
- `parseLimit` — same shape as existing tools.
- `parseCultureRef` — mirrors existing culture-ref parsing (value >= 0 or non-empty string).
- `createFindStatesByCultureTool(runtime)` returns `Tool`; `findStatesByCultureTool` is the default instance.

## Tests
Mirror `find-burgs-by-culture.test.ts`:
- **Pure scanner block** (`findStatesByCultureInPack`):
  - multi-state culture (3 states in culture 1)
  - second culture, no cross-contamination
  - culture 0 (Wildlands) — matching states returned, Neutrals (i=0) still skipped
  - empty culture (exists but no state points to it)
  - skips i=0 (Neutrals) and `removed: true` states
  - limit truncation preserves full `count`
  - field population (fullName, form, color, capital-name lookup)
  - capital-null when `state.capital === 0` or burg missing
  - `"not-ready"` when pack or pack.states is missing
- **`resolveCultureRefInPack` block**: numeric id, case-insensitive name, id 0 allowed, not-found unknown, not-found removed, not-found out-of-range, not-ready missing.
- **Tool-surface block**: ok numeric, ok string name, ok id 0 (Wildlands), rejects invalid inputs (null, "", whitespace, -1, 1.5, bool), not-found surfaced, not-ready (both seams: resolve + find), explicit limit + full count, invalid limit, default limit applied, empty list, exported schema shape, constants exported.
- **`defaultFindStatesByCultureRuntime` integration block**: resolve via default runtime, find via default runtime, tool end-to-end, pack missing surfaces "not ready".

Use `as unknown as { … }` casts on `FakePack` to keep tests permissive.

## Registration
- `src/ai/index.ts`: import near `findBurgsByReligionTool`, add re-export block for `createFindStatesByCultureTool`, `DEFAULT_…`, `defaultFindStatesByCultureRuntime`, types, `findStatesByCultureInPack`, `findStatesByCultureTool`, `MAX_…`. `registry.register(findStatesByCultureTool)` adjacent to `findBurgsByCultureTool`.

## README_AI.md
Insert a new row after `find_burgs_by_religion` (or adjacent to `find_burgs_by_culture`), with API-key line, and example usage column.

## Verification
- `npm run lint` baseline 7 warnings / 1 info / 0 errors — must remain.
- `npm run build` passes.
- `npm test` passes; new suite adds coverage.
