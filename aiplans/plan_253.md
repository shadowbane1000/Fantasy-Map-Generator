# Plan 253: `find_largest_states` tool

Add a new AI tool that returns the top N states ranked by a chosen metric.
Parallel to `find_largest_burgs` (plan analog).

## Goals

- Tool name: `find_largest_states`.
- Accept `by` (string, optional, default `"area"`): one of `"area"`, `"cells"`,
  `"population"`. Case-insensitive.
- Accept `n` (number, optional, default `10`): integer in `[1, 500]`.
- Read `pack.states`, skip id=0 (Neutrals) and `removed: true`.
- Rank descending by chosen metric; `"population"` uses `state.rural + state.urban`
  (pre-aggregated raw values).
- Return `{ ok, states, count, requested_n, by }` where each state is
  `{ i, name, fullName, form, color, capital, area, cells, population }`.
  - `capital` is the capital burg name (or `null`) — mirrors `list_states`.
  - `population` is raw (rural + urban) not rate-scaled, keeping parity with the
    ranking key (so results align with `find_largest_burgs`, which also returns
    raw `burg.population`).
- Read-only. Requires an Anthropic API key to surface through the chat harness.

## Architecture

- Pure ranker `findLargestStatesInPack(pack, n, by)` operating on a minimal
  `PackLike` (states + burgs for capital-name resolution). Returns
  `FindLargestStatesPayload | "not-ready"`.
- Runtime seam `FindLargestStatesRuntime` with `defaultFindLargestStatesRuntime`
  reading `window.pack` via `getPack`.
- `createFindLargestStatesTool(runtime)` factory producing a `Tool` with the
  standard `{name, description, input_schema, execute}` shape, plus a
  default-bound `findLargestStatesTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, constants, factory, pure
  function, runtime, default tool) in alphabetical-adjacent spot near
  `find_largest_burgs`.
- Tool registered in `registerDefaultTools` alongside `findLargestBurgsTool`.
- README_AI.md row added adjacent to `find_largest_burgs`.

## Validation

- `by` parsed case-insensitively; rejects anything other than the three metrics.
- `n` must be integer in [1, 500] (default 10). Non-integer, out-of-range,
  boolean, string forms rejected with a descriptive error.
- Rejects un-generated map (`pack` / `pack.states` missing) with "Map is not
  ready yet" error (matches existing tool copy).

## Output format

```ts
{
  ok: true,
  states: [{
    i: number;
    name: string;
    fullName: string | null;
    form: string | null;
    color: string | null;
    capital: string | null;
    area: number;
    cells: number;
    population: number; // raw rural+urban
  }],
  count: number,        // states.length (0 ≤ count ≤ n)
  requested_n: number,
  by: "area" | "cells" | "population",
}
```

## Tests

A single `find-largest-states.test.ts` with three suites:
1. Pure ranker: ordering by each metric, n-slicing, skip-removed, skip-id-0,
   not-ready handling, empty-pack handling.
2. Tool surface: default `n`/`by`, case-insensitive `by`, invalid `by`, invalid
   `n`, propagates `not-ready`, schema presence.
3. Default runtime integration: backs against `globalThis.pack`, asserts happy
   and missing-pack paths.

## Files

- `src/ai/tools/find-largest-states.ts` — implementation.
- `src/ai/tools/find-largest-states.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row.
