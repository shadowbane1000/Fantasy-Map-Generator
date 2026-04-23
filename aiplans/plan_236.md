# Plan 236 — `find_rivers_by_basin` AI Tool

## Status

Baseline: **7 warnings / 1 info / 0 errors** on `npm run lint`,
**3933 tests passing** across 248 files. Rivers already have several
AI tools: `list_rivers`, `get_river_info`, `find_nearest_river`,
`find_rivers_in_area`, `rename_river`, plus various mutators. What
we DON'T have is a direct watershed audit — "list every river that
ultimately flows into X", where X is the basin root river id.

## Use Case

**`find_rivers_by_basin`** — list every active river in `pack.rivers`
whose `basin` field equals a caller-provided basin root river id
(or ref). `basin` on the RawRiver is itself a river id — by
convention the id of the drainage's root river. A river is its own
basin when `river.basin === river.i`. The tool iterates rivers
linearly, skipping `removed: true` and the index-0 placeholder, and
filters by `river.basin === basinI`. Optionally it also includes the
basin root river itself (`include_self`, default `true`).

Typical question: "Which tributaries feed into the Great River?"
— the user picks the basin river, and this tool returns every river
whose drainage empties into it, including the root when
`include_self` is on.

This parallels:

- `find_provinces_by_state` (filter provinces by `province.state`)
- `find_rivers_in_area` (filter rivers by mouth-cell coords)
- `list_rivers`'s existing `basin` filter — except that one is
  paginated (`limit/offset`) and mixes multiple filters. This new
  tool focuses on a single primary filter with a flat `{ok, basin,
  rivers, count}` response, matching the `find_*` family.

### Success criteria

1. A tool `find_rivers_by_basin` is registered and callable from the
   AI chat.
2. Given a basin ref (numeric id or case-insensitive name), the tool
   resolves it via the shared `findRiverByRef` helper (identical to
   `rename_river` / `get_river_info`), then returns every
   non-removed river whose `basin === basinI`.
3. `include_self` (default `true`) controls whether the basin root
   river itself appears in the `rivers` array.
4. Optional `limit` (default 10000, max 100000) caps the returned
   array; `count` is always the full total.
5. Returns `{ ok, basin: {i, name}, rivers: [{i, name, type, parent,
   source, mouth, length, discharge}], count }`. On a missing /
   un-generated map returns a structured `not-ready` error. On a
   missing or unresolvable basin ref, returns a structured error.
6. Read-only — no mutations of `pack`.
7. Tests cover the pure scanner (all filter / edge paths), the tool
   surface (schema + error mapping), and a `defaultFindRiversByBasinRuntime`
   integration block that seeds `globalThis.pack` with a synthetic
   basin network and verifies end-to-end.
8. README_AI.md gains one row near `find_rivers_in_area` /
   `get_river_info` describing the tool + example prompts, and the
   row contains an Anthropic-API-key pointer.
9. `npm run build` succeeds. `npm run lint` matches baseline. All
   existing tests still pass; new tests pass.

## Architecture

Single file: `src/ai/tools/find-rivers-by-basin.ts`, following the
same seam pattern as `find-rivers-in-area.ts` / `find-provinces-by-state.ts`:

- Pure `findRiversByBasinInPack(pack, basinI, includeSelf, limit)`
  → `FindRiversByBasinResult = FindRiversByBasinPayload | "not-ready"`.
- `FindRiversByBasinRuntime` interface with `resolveBasin(ref)` and
  `find(basinI, includeSelf, limit)`.
- `defaultFindRiversByBasinRuntime` reads `getPack<PackLike>()`.
- `createFindRiversByBasinTool(runtime = default)` builds the
  `Tool` wrapper, does input validation, and maps runtime states
  (`not-ready`, `not-found`) to structured error results.

Basin resolution reuses `findRiverByRef` from `rename-river.ts`
(same way `get_river_info` does).

## Validation

- Baseline: `npm run lint 2>&1 | tail -5` expected to print
  `7 warnings / 1 info`.
- `npm run build`.
- `npm test` → expect +N new test cases, all existing 3933 still
  passing.
- `npm run lint` post-change must match baseline.
