# Plan 255 — `find_largest_religions`

## Goal

Add a new read-only AI tool `find_largest_religions` that returns the top N religions ranked by a chosen size metric (`area`, `cells`, or `population`) descending. This is a ranking tool (top-N) parallel to `find_largest_states` and `find_largest_cultures` (the religion-level counterpart of those). Useful for "show me the 10 largest religions" prompts without forcing the caller to pick numeric thresholds.

## Analogs

- `src/ai/tools/find-largest-states.ts` — direct analog: identical `by` metric set, same seam pattern, same output shape (swap `state` → `religion` fields).
- `src/ai/tools/find-largest-states.test.ts` — mirror test structure (pure ranker, tool surface, `defaultRuntime` integration).
- `src/ai/tools/get-religion-info.ts` — source of truth for the religion fields we expose (`i`, `name`, `color`, `type`, `form`, `area`, `cells`, `rural`, `urban`). Population comes from raw pre-aggregated `rural + urban` (NOT rate-scaled) to match `find_largest_states` and `find_largest_cultures`.
- `src/ai/tools/list-religions.ts` — religion enumeration pattern, skip index-0 placeholder + removed.
- `src/ai/tools/_shared/index.ts` — `errorResult`, `okResult`, `getPack`, `RawReligion`.

## Position / ranking

For each religion in `pack.religions`:
- Skip `i === 0` placeholder ("No religion").
- Skip `removed: true`.
- Collect a hit with `i`, `name`, `color`, `type`, `form`, `area`, `cells`, `population = rural + urban` (raw).

After collection, sort by the chosen metric desc (stable). Slice top `n`.

Metric mapping (matches `find_largest_states`):
- `"area"` → `religion.area`.
- `"cells"` → `religion.cells`.
- `"population"` → `religion.rural + religion.urban` (raw, not rate-scaled).

Missing numeric fields fall back to `0`.

## Tool shape

- Name: `find_largest_religions`.
- Inputs (all optional):
  - `n` (integer in [1, 500], default 10).
  - `by` (string, case-insensitive — `"area"` | `"cells"` | `"population"`, default `"area"`).
- Output:
  - `{ ok, religions, count, requested_n, by }` where each religion hit is `{ i, name, color, type, form, area, cells, population }`.
  - `count` = number of returned religions (after slice) — ranges from 0 to `n`.
  - `requested_n` = echoes the resolved `n`.
  - `by` = echoes the lower-cased metric.
  - Empty result still `ok: true`.

## Error modes

- Missing pack / `pack.religions` → `not-ready`.
- Invalid `n` (non-integer, < 1, > 500) → reject.
- Invalid `by` (not in the allowed enum) → reject.

## Files

1. `src/ai/tools/find-largest-religions.ts` — pure ranker + seam + tool factory.
2. `src/ai/tools/find-largest-religions.test.ts` — mirrored test coverage including `defaultFindLargestReligionsRuntime` integration block.
3. `src/ai/index.ts` — import / re-export / register near `findLargestStatesTool`.
4. `README_AI.md` — add a row near `find_largest_states`.

## Verification

- `npm run build` succeeds.
- `npm test` all pass (baseline 4480 → expected ~4520).
- `npm run lint` baseline preserved (7 warnings / 1 info / 0 errors).
