# Plan 251 — `find_longest_rivers` AI tool

## Goal

Add a read-only tool that returns the **top N rivers on the current map ranked by length descending**. This is the ranking companion to `list_rivers` (paginated, arbitrary order) and `find_rivers_in_area` (area-scoped). It mirrors the conceptual parallel requested in the brief to `find_largest_burgs` (top-N ranking pattern).

## Use case

Agents / callers frequently want the headline rivers of a map — "the 5 longest rivers", "top 20 by length". Rather than paginate through `list_rivers` and sort client-side, a single tool call should return the ranked slice.

## Inputs

- `n` — optional integer, default **10**, range `[1, 500]`. Caps the slice size. Non-integer / out-of-range values are a structured error.

## Output

Success:
```
{
  ok: true,
  rivers: [{ i, name, type, length, discharge, source, mouth }, ...],
  count,           // length of returned rivers[]
  requested_n      // echoed input after defaulting
}
```

Failure (structured): `not-ready` when `pack` or `pack.rivers` is missing, `limit must be an integer in [1, 500]` when `n` is bad.

## River row shape

- `i` — `river.i`
- `name` — `river.name ?? ""`
- `type` — `river.type ?? null`
- `length` — `river.length ?? 0`
- `discharge` — `river.discharge ?? 0`
- `source` — `river.source ?? 0`
- `mouth` — `river.mouth ?? 0`

## Algorithm

1. Read `pack.rivers` (abort with `not-ready` if missing).
2. Filter: skip `r.i === 0` (placeholder) and `r.removed`.
3. Sort remaining by `length` descending (treating missing/NaN length as 0).
4. Slice top `n`.
5. Map to the output row shape.
6. Echo `requested_n` and `count`.

## Architecture — runtime seam

Follow the pattern established by `find-rivers-in-area.ts` and `get-river-info.ts`:

- `readLongestRiversFromPack(pack, n)` — pure, takes a `PackLike` and `n`, returns either a typed payload or the string `"not-ready"`.
- `interface FindLongestRiversRuntime { find(n: number): ... }`
- `defaultFindLongestRiversRuntime` calls `getPack<PackLike>()`.
- `createFindLongestRiversTool(runtime?)` returns a `Tool` with parseInput → runtime.find → `okResult` / `errorResult`.
- Exported default: `findLongestRiversTool`.

## Constants

- `DEFAULT_FIND_LONGEST_RIVERS_N = 10`
- `MAX_FIND_LONGEST_RIVERS_N = 500`

## Registration

- Import + register in `src/ai/index.ts` next to the other river-finders (after `findRiversByStateTool`).
- Re-export tool + constants + types from the barrel exports section.

## Tests

Unit-style tests covering:
- Returns top N sorted by length descending
- Default `n = 10` when omitted
- Skips index-0 placeholder and `removed: true` rivers
- Treats missing/NaN `length` as 0
- `count` reflects actual returned length
- `n` bounds: rejects 0, negative, > 500, non-integer, string, NaN, infinity
- `not-ready` when `pack` missing / `pack.rivers` missing
- Tool surface: errors surface as `isError: true`, ok path returns expected JSON
- Tool schema: name, no required fields, `n` parameter
- `DEFAULT_` / `MAX_` constants exposed
- `defaultFindLongestRiversRuntime` integration block: mutate `globalThis.pack`, assert, restore.

## README_AI.md

Add a new table row near `find_rivers_in_area` describing the tool, and include API-key reference. Example user phrases: "What are the 5 longest rivers?", "Show me the top 10 rivers by length", "List the longest river".

## Risk / Gotchas

- `pack.rivers` contains an index-0 placeholder that must be skipped.
- `river.length` can be missing; normalize via `typeof r.length === "number" ? r.length : 0`.
- Sort stability — JS `Array.prototype.sort` is stable in modern engines, so ties preserve pack order. Acceptable.
- No mutation of `pack.rivers` — the sort operates on a filtered copy.

## Out of scope

- No filtering by basin / state / type — those belong to dedicated tools (`find_rivers_by_basin`, `find_rivers_by_state`, `list_rivers`).
- No pagination — capped at `n <= 500`.
- No distance / position lookups.
