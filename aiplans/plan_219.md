# Plan 219 — `find_burgs_by_religion` AI tool

## Goal
Add a read-only AI tool that lists every active burg belonging to a given religion. Religions are stored per-cell (not per-burg), so matching is via `pack.cells.religion[burg.cell] === religionI` — the same indirection `get_religion_info` uses to count `burgs_count`. This is the religion-filtered parallel of `list_burgs` and the bulk counterpart of `get_religion_info`'s `burgs_count` field.

## Shape
- File: `src/ai/tools/find-burgs-by-religion.ts`
- Test: `src/ai/tools/find-burgs-by-religion.test.ts`
- Register in `src/ai/index.ts` (import + re-exports + `registry.register`).
- Add README_AI.md row adjacent to `find_burgs_by_culture`.

## Tool contract
- name: `find_burgs_by_religion`
- input:
  - `religion` (integer | string, required) — numeric id `>= 0` (id 0 = "No religion" is allowed; burgs on cells with no organized religion match) or case-insensitive `name`.
  - `limit` (integer, 1..100000, default 10000).
- output: `{ ok, religion: {i, name}, burgs: [{i, name, x, y, population, capital}], count }`.
- read-only — no pack mutation.

## Key differences from `find_burgs_by_state` and `find_burgs_by_culture`
- **Indirection**: religions are stored per-cell (`pack.cells.religion[cellI]`), not on the burg. Match: `pack.cells.religion[burg.cell] === religionI`. This mirrors `get_religion_info`'s `burgs_count` scan.
- **Religion 0 is allowed** (parallels `find_burgs_by_culture` with Wildlands = 0). `get_religion_info` rejects 0, but for a _by_ lookup, 0 groups all burgs sitting on cells with no organized religion — a legitimate query.
- Religions don't carry `fullName`, so resolution is by `name` only (like cultures).
- The `PackLike` must include `cells.religion: Array<number | undefined> | number[]` (plus `burgs` and `religions`).

## Implementation sketch
Copy structure from `find-burgs-by-culture.ts` (closest analog since both allow id 0 and lack `fullName`):
- Constants: `DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT = 10000`, `MAX_FIND_BURGS_BY_RELIGION_LIMIT = 100000`.
- Types: `FindBurgsByReligionHit`, `FindBurgsByReligionPayload`, `FindBurgsByReligionResult`, `ResolvedReligion`, `ResolveReligionResult`, `PackLike`, `FindBurgsByReligionRuntime`.
- `resolveReligionRefInPack(pack, ref)` — returns `ResolvedReligion | "not-ready" | "not-found"`. Allows numeric 0. Mirrors `resolveCultureRefInPack`.
- `findBurgsByReligionInPack(pack, religionI, limit)` — iterate `pack.burgs`, skip `i === 0` / `removed`, read `burg.cell` → `pack.cells.religion[burg.cell]`, filter on `=== religionI`. Cap output at limit, still increment `count`. Returns `"not-ready"` if `pack.burgs` or `pack.cells.religion` is missing.
- `defaultFindBurgsByReligionRuntime` — reads pack via `getPack<PackLike>()`.
- `parseLimit` — same shape as existing tools.
- `parseReligionRef` — mirrors `parseCultureRef` (value >= 0 or non-empty string).
- `createFindBurgsByReligionTool(runtime)` returns `Tool`; `findBurgsByReligionTool` is the default instance.

## Tests
Mirror `find-burgs-by-culture.test.ts`, with the cell-indirection layer in the fixture:
- **Pure scanner block**:
  - multi-burg religion via cells.religion lookup
  - second religion, no cross-contamination
  - religion 0 (no organized religion) returns its burgs
  - empty religion (exists but no burg cells match)
  - skip i=0 placeholder and removed burgs
  - burg with cell whose cells.religion is out-of-bounds / undefined — doesn't match
  - limit truncation preserves count
  - field population (x, y, name, population, capital)
  - "not-ready" when pack or pack.burgs or pack.cells.religion is missing
- **`resolveReligionRefInPack`** block: numeric id, case-insensitive name, id 0 allowed, not-found unknown, not-found removed, not-found out-of-range, not-ready missing.
- **Tool-surface block**: ok numeric, ok string name, ok id 0, rejects invalid inputs (null, "", whitespace, -1, 1.5, bool), not-found surfaced, not-ready (both seams), explicit limit + full count, invalid limit, default limit, empty list, exported schema shape, constants exported.
- **`defaultFindBurgsByReligionRuntime` integration block**: set `globalThis.pack`, verify resolve + find + end-to-end tool + restores not-ready when pack removed. Use `as unknown as { ... }` casts.

## Registry + docs
- Import `findBurgsByReligionTool` in `src/ai/index.ts` (alphabetical — after `findBurgsByCultureTool`, before `findBurgsByStateTool`).
- Add the matching `export { … } from "./tools/find-burgs-by-religion"` block in alphabetical order.
- Call `registry.register(findBurgsByReligionTool)` next to the other burg tools.
- Add README_AI.md row directly after the `find_burgs_by_culture` row, matching the existing style (must mention API-key requirement).

## Verification
- `npm run build` succeeds.
- `npm test` all pass; test count grows from 3377.
- `npm run lint` stays at 7 warnings / 1 info / 0 errors.
