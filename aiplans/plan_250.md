# Plan 250 — `find_largest_burgs`

## Goal

Add a new read-only AI tool `find_largest_burgs` that returns the top N burgs ranked by raw `burg.population` descending. This is a ranking tool (top-N) rather than a filter tool. Useful for "show me the 10 biggest cities" prompts. Optional `state` filter to rank within a specific state.

## Analogs

- `src/ai/tools/find-burgs-by-population-range.ts` — closest analog: burg population access, seam pattern, same `FindBurgsByPopulationRangeHit` output shape (plus `state_id`).
- `src/ai/tools/get-population-stats.ts` — confirms ranking approach (`burgCandidates.sort((a, b) => b.population - a.population)` on raw `burg.population`); we'll mirror this pattern but preserve raw population (not rate-scaled) to match `find_burgs_by_*` conventions.
- `src/ai/tools/list-burgs.ts` — burg enumeration + `resolveStateRefInPack` helper for the optional state filter.
- `src/ai/tools/_shared/index.ts` — `errorResult`, `okResult`, `getPack`, `isActive`, `RawBurg`, `RawState`, `findEntityByRef`.
- `src/ai/tools/find-burgs-by-state.ts` — reference for state ref resolution via `findEntityByRef` (rejects id 0 Neutrals).

## Position / ranking

For each burg in `pack.burgs`:
- Skip `i === 0` placeholder.
- Skip `removed: true`.
- Skip burgs without a numeric `population` field.
- If a `state` filter is active, skip burgs whose `burg.state` doesn't match the resolved state id.
- Collect hits with raw `burg.population`.

After collection, sort by `population` descending (stable sort is fine; Array.prototype.sort is stable in modern engines). Slice top `n`.

## Tool shape

- Name: `find_largest_burgs`.
- Inputs (all optional):
  - `n` (integer in [1, 500], default 10).
  - `state` (integer id > 0 OR non-empty string — same shape as `find_burgs_by_state`; id 0 Neutrals rejected).
- Output:
  - `{ ok, burgs, count, requested_n, state }` where each burg hit is `{ i, name, x, y, population, capital, state_id }`.
  - `count` = number of returned burgs (after slice) — ranges from 0 to `n`.
  - `requested_n` = the resolved `n` (echo, for the model).
  - `state` = `{ i, name }` when filter active, else `null`.
  - Empty result still `ok: true`.

## Error modes

- Missing pack / `pack.burgs` → `not-ready`.
- Invalid `n` (non-integer, < 1, > 500) → reject.
- `state` ref provided but unresolvable (or id 0) → reject.

## Files

1. `src/ai/tools/find-largest-burgs.ts` — pure ranker + seam + tool factory.
2. `src/ai/tools/find-largest-burgs.test.ts` — mirrored test coverage including `defaultFindLargestBurgsRuntime` integration block.
3. `src/ai/index.ts` — import / re-export / register near `findBurgsByPopulationRangeTool`.
4. `README_AI.md` — add a row near `find_burgs_by_population_range`.

## Verification

- `npm run build` succeeds.
- `npm test` all pass (baseline 4380 → expected ~4420).
- `npm run lint` baseline preserved (7 warnings / 1 info / 0 errors).
