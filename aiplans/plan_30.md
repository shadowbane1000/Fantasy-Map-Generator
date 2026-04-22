# Plan 30 — Use Case: List routes

## Status

Iteration 30. 29 AI tools. Baseline 7 warnings / 1 info / 0 errors.
377 tests pass.

## Use Case

**"List the routes (roads, trails, and sea lanes) on the current map."**

Data model: `pack.routes` (see
`src/modules/routes-generator.ts:177-184`). Fields: `i`, `group`
(`"roads" | "trails" | "searoutes"`), `feature` (landmass/water
feature id), `points` (array of `[x, y, cellId]`), optional `cells`,
optional `merged`.

At display time, the Routes Overview
(`public/modules/ui/routes-overview.js:31-70`) lazily computes
`route.name` via `Routes.generateName(route)` and caches it on the
route object, plus `route.length` via `Routes.getLength(route.i)`.
For the read-only list tool we don't want to mutate the pack, so we
return whatever `name`/`length` are currently stored (possibly
null/0) and let the user re-open the Routes Overview to prime them
if they care.

Prompts:
- *"List the roads on this map."*
- *"Which are the longest routes?"*
- *"Show me all the sea lanes."*

### Success criteria

1. `list_routes()` returns a paginated JSON. Each entry:
   `{i, group, name, length, feature, points: number, cells: number, merged}`
   where `points` / `cells` are counts (not the arrays — those are
   huge).
2. Skips removed routes (defensive — routes don't currently use a
   `removed` flag but tolerate one).
3. `group` filter — optional, must be one of
   `"roads" | "trails" | "searoutes"` (case-insensitive).
4. `min_length` filter — non-negative finite number; filters by
   stored `length` (0 for uncomputed routes).
5. Paginated: limit 1–500 (default 100), offset ≥ 0.
6. Graceful error when `pack.routes` is missing.

## Scope

In-scope:
- `list_routes` tool via `createPaginatedListTool`.
- Pure `readRoutesFromPack(pack)` helper.
- Registry + README + tests.

Out-of-scope:
- Computing `length` / `name` for routes that don't have them yet
  (that mutates the pack).
- Editing / deleting routes.

## Design

New file: `src/ai/tools/list-routes.ts`.

```ts
export type RouteGroup = "roads" | "trails" | "searoutes";
export interface RouteSummary {
  i: number;
  group: RouteGroup | string; // tolerate unexpected values
  name: string | null;
  length: number;
  feature: number;
  points: number;
  cells: number;
  merged: boolean;
}
export interface RoutesRuntime {
  readRoutes(): RouteSummary[] | null;
}
```

Default runtime reads `window.pack.routes`. The pure helper maps
each raw route to a summary with array-length counts and tolerates
missing fields.

Filters in `parseFilters`:
- `group?: string` — case-insensitive, must resolve to one of the
  three canonical group names.
- `min_length?: number` — non-negative.

## Files

Create: `plan_30.md`, `tasks_30.md`,
`src/ai/tools/list-routes.ts`,
`src/ai/tools/list-routes.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-routes.test.ts`):

1. Full list default paging.
2. Paging honored.
3. Invalid paging rejected.
4. `group: "roads"` filter (case-insensitive).
5. Unknown group → error listing the three valid groups.
6. `min_length: 50` filter.
7. Invalid `min_length` (negative, NaN, string) → error.
8. Runtime null → error.

Pure helper tests:

9. `readRoutesFromPack` — counts points and cells, tolerates missing
   fields, skips `removed`.
10. Returns null when pack/routes missing.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test. Reuses the `createPaginatedListTool`
factory.

Lint / test / build gates in tasks_30.md.
