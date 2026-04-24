# Plan 254: `find_largest_cultures` tool

Add a new AI tool that returns the top N cultures ranked by a chosen metric.
Parallel to `find_largest_states` (plan 253) and `find_largest_burgs` — the
culture-level ranking counterpart.

## Goals

- Tool name: `find_largest_cultures`.
- Accept `by` (string, optional, default `"area"`): one of `"area"`, `"cells"`,
  `"population"`. Case-insensitive.
- Accept `n` (number, optional, default `10`): integer in `[1, 500]`.
- Read `pack.cultures`, skip `removed: true` entries.
  - Note: index-0 is the Wildlands placeholder. Following `list_cultures`'
    behaviour (which uses `isActive` — skipping index 0), we also skip it here.
- Rank descending by chosen metric; `"population"` uses `culture.rural + culture.urban`
  (pre-aggregated raw values, matching the raw-units convention from
  `find_largest_states` / `find_largest_burgs`).
- Return `{ ok, cultures, count, requested_n, by }` where each culture is
  `{ i, name, color, type, area, cells, population }`.
- Read-only. Requires an Anthropic API key to surface through the chat harness.

## Architecture

- Pure ranker `findLargestCulturesInPack(pack, n, by)` operating on a minimal
  `PackLike` (cultures only). Returns `FindLargestCulturesPayload | "not-ready"`.
- Runtime seam `FindLargestCulturesRuntime` with
  `defaultFindLargestCulturesRuntime` reading `window.pack` via `getPack`.
- `createFindLargestCulturesTool(runtime)` factory producing a `Tool` with the
  standard `{name, description, input_schema, execute}` shape, plus a
  default-bound `findLargestCulturesTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, constants, factory, pure
  function, runtime, default tool) alphabetically near `find_largest_burgs` /
  `find_largest_states`.
- Tool registered in `registerDefaultTools` alongside `findLargestStatesTool`.
- README_AI.md row added adjacent to `find_largest_states`.

## Validation

- `by` parsed case-insensitively; rejects anything other than the three metrics.
- `n` must be integer in [1, 500] (default 10). Non-integer, out-of-range,
  boolean, string forms rejected with a descriptive error.
- Rejects un-generated map (`pack` / `pack.cultures` missing) with "Map is not
  ready yet" error (matches existing tool copy).

## Output format

```ts
{
  ok: true,
  cultures: [{
    i: number;
    name: string;
    color: string | null;
    type: string | null;
    area: number;
    cells: number;
    population: number; // raw rural+urban
  }],
  count: number,        // cultures.length (0 <= count <= n)
  requested_n: number,
  by: "area" | "cells" | "population",
}
```

## Tests

A single `find-largest-cultures.test.ts` with three suites:
1. Pure ranker: ordering by each metric, n-slicing, skip-removed, skip-id-0
   Wildlands placeholder, not-ready handling, empty-pack handling.
2. Tool surface: default `n`/`by`, case-insensitive `by`, invalid `by`, invalid
   `n`, propagates `not-ready`, schema presence.
3. Default runtime integration: backs against `globalThis.pack`, asserts happy
   and missing-pack paths.

## Files

- `src/ai/tools/find-largest-cultures.ts` — implementation.
- `src/ai/tools/find-largest-cultures.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `find_largest_states`.
