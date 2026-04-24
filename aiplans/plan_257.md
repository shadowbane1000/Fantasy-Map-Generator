# Plan 257: `find_largest_features` tool

Add a new AI tool that returns the top N features (continents / islands /
lakes / oceans) ranked by a chosen metric. Parallel to `find_largest_states`
and companion to the paginated `list_features`.

## Goals

- Tool name: `find_largest_features`.
- Accept `type` (string, optional): filter to `"continent"`, `"island"`,
  `"lake"`, or `"ocean"` (case-insensitive). If omitted, include all types.
  Mirrors `list_features` type semantics — `"continent"` is a convenience
  alias matching features whose `group` is `"continent"` (continents share
  the raw type `"island"`).
- Accept `by` (string, optional, default `"area"`): one of `"area"`,
  `"cells"`. Case-insensitive.
- Accept `n` (number, optional, default `10`): integer in `[1, 500]`.
- Read `pack.features`, skip `pack.features[0]` placeholder (the generator
  writes `0` there) and any non-object / falsy slot.
- Rank descending by chosen metric.
- Return `{ ok, features, count, requested_n, by, type_filter }` where each
  feature is `{ i, type, group, name, area, cells, land, border }`.
- Read-only. Requires an Anthropic API key to surface through the chat
  harness.

## Architecture

- Pure ranker `findLargestFeaturesInPack(pack, n, by, typeFilter)` operating
  on a minimal `PackLike`. Returns
  `FindLargestFeaturesPayload | "not-ready"`.
- Runtime seam `FindLargestFeaturesRuntime` with
  `defaultFindLargestFeaturesRuntime` reading `window.pack` via `getPack`.
- `createFindLargestFeaturesTool(runtime)` factory producing a `Tool` with
  the standard `{name, description, input_schema, execute}` shape, plus a
  default-bound `findLargestFeaturesTool` export.
- Re-exports added to `src/ai/index.ts` barrel (types, constants, factory,
  pure function, runtime, default tool) in alphabetical-adjacent spot near
  `find_largest_cultures`.
- Tool registered in `registerDefaultTools` alongside the other
  `findLargest*` tools.
- README_AI.md row added adjacent to `list_features`.

## Validation

- `by` parsed case-insensitively; rejects anything other than the two
  metrics.
- `type` (when provided) parsed case-insensitively; rejects anything other
  than `"island" | "lake" | "ocean" | "continent"`. Empty / whitespace
  string rejected.
- `n` must be integer in [1, 500] (default 10). Non-integer, out-of-range,
  boolean, string forms rejected with a descriptive error.
- Rejects un-generated map (`pack` / `pack.features` missing) with
  "Map is not ready yet" error.

## Output format

```ts
{
  ok: true,
  features: [{
    i: number;
    type: string | null;
    group: string | null;
    name: string | null;
    area: number;
    cells: number;
    land: boolean;
    border: boolean;
  }],
  count: number,          // features.length (0 ≤ count ≤ n)
  requested_n: number,
  by: "area" | "cells",
  type_filter: "island" | "lake" | "ocean" | "continent" | null,
}
```

## Tests

A single `find-largest-features.test.ts` with three suites:
1. Pure ranker: ordering by each metric, n-slicing, skip index-0 placeholder
   and falsy slots, type filter (continent/island/lake/ocean), combined
   filter + ordering, not-ready handling, empty-pack handling, missing
   numeric fields coerced to 0.
2. Tool surface: default `n`/`by`, case-insensitive `by`,
   case-insensitive `type`, invalid `by`, invalid `type`, invalid `n`,
   propagates `not-ready`, schema presence.
3. Default runtime integration: backs against `globalThis.pack`, asserts
   happy and missing-pack paths.

## Files

- `src/ai/tools/find-largest-features.ts` — implementation.
- `src/ai/tools/find-largest-features.test.ts` — tests.
- `src/ai/index.ts` — import + re-exports + register.
- `README_AI.md` — tool row near `list_features`.
