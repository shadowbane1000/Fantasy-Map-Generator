# Plan 192 — `get_route_info` AI Tool

## Status

Adds a read-only per-route inspector, parallel to `get_river_info` / `get_zone_info` / other `get_*_info` tools. Baseline before work: lint **7 warnings, 1 info, 0 errors**, tests **2789 passing across 204 files**.

## Use Case

An AI assistant needs to answer questions like:
- "Describe route 5."
- "What's the full path of the King's Road?"
- "Which cells does the Silk Trail pass through?"
- "Is route 12 locked?"

`list_routes` returns per-route summaries with counts only (`points`, `cells` are numbers, not arrays). The assistant has no way to inspect the full geometry of a single route before editing it — blocking thoughtful use of `rename_route`, `set_route_group`, `set_route_lock`, `remove_route`, or `add_route`. `get_route_info` fills that gap.

## Scope

In-scope:
- New tool `get_route_info({route, limit?})` returning `{ok, i, name, group, length, lock, feature, points, points_count}`.
- `route` ref accepts numeric id or case-insensitive name (matches `rename_route` / `set_route_group` / `set_route_lock` / `remove_route` via shared `findRouteByRef`).
- **Important deviation from the other `get_*_info` tools**: route ids start at **0** (the generator assigns `i = 0` to the first route — see `add-route.ts:52-59` and the `list_routes.test.ts` fixture), so the stock `parseEntityRef` (which rejects `0`) is unsuitable. Use a local `parseRouteRef` that accepts non-negative integers, mirroring `get_zone_info.ts:62-75`.
- `limit` truncates the returned `points` array (default & cap `5000`), matching the zone-info pattern. `points_count` always reports the true length.
- Returns `length` from `route.length` when tracked; otherwise sums Euclidean segment lengths from the `points` array (the Routes Overview only populates `route.length` lazily after the overview is opened).
- Returns `feature` as the raw `route.feature` number (`0` when unset — matches `list_routes`). Populated for sea routes; land routes carry the landmass feature id.
- Skips routes where `removed: true` — returns `"not-found"`.
- Registered in `src/ai/index.ts`; exported from the barrel; a README_AI.md row added near the other `get_*_info` tools.
- Pure-fn seam (`readRouteInfoFromPack`) + runtime seam (`RouteInfoRuntime`) so tests can drive the tool deterministically.
- Unit tests: pure-fn coverage (happy path, numeric + name ref, removed routes, unknown refs, missing length fallback, limit truncation, zero-routes, un-generated map) + `defaultRouteInfoRuntime` integration block (sets `globalThis.pack`, reads back through the tool).

Out-of-scope:
- Any mutation.
- Deriving segment-by-segment distances for very long sea lanes — the total length is enough.
- Exposing adjacent route ids via `pack.cells.routes` — callers who need that walk `get_cell_info`.

## Data model

Every route record (`RawRoute` in `_shared/pack-types.ts:163`):

```
{ i, group, name?, length?, feature?, points?, cells?, merged?, lock?, removed? }
```

`points` is an array of `[x, y, cellI]` triples (per `add-route.ts:86` and `src/modules/routes-generator.ts:181`). For this tool:

- `points` returned as `Array<[number, number, number]>`, truncated to `limit`.
- `points_count` = full `points.length` before truncation.
- `length`: if `typeof route.length === "number"` use it; else sum `hypot(x2-x1, y2-y1)` across consecutive points (0 when fewer than 2 points).

## Tool schema

```ts
{
  name: "get_route_info",
  input_schema: {
    type: "object",
    properties: {
      route: { type: ["integer", "string"], description: "..." },
      limit: { type: "integer", minimum: 0, maximum: 5000, description: "..." },
    },
    required: ["route"],
  },
}
```

Returned body:

```ts
{
  ok: true,
  i: number,
  name: string | null,          // route.name ?? null
  group: string,                // route.group ?? ""
  length: number,               // tracked or computed
  lock: boolean,                // !!route.lock
  feature: number,              // route.feature ?? 0
  points: Array<[number, number, number]>,  // truncated to limit
  points_count: number,          // full length
}
```

Errors:
- Missing / invalid `route` (non-integer, negative, empty string): structured error.
- Pack missing → `not-ready` → errorResult("Map is not ready yet …").
- No matching / removed route → errorResult(`No route found matching …`).
- Bad `limit` → errorResult.

## File layout

- `src/ai/tools/get-route-info.ts` — implementation.
- `src/ai/tools/get-route-info.test.ts` — pure + integration tests.
- `src/ai/index.ts` — import, barrel export, registry registration (near `getZoneInfoTool`).
- `README_AI.md` — new row next to the other `get_*_info` rows, with "Requires an Anthropic API key …" trailer.

## Verification

- `npm run build` passes (tsc strict).
- `npm test` green; new test file adds ~15 tests.
- `npm run lint` remains at **7 warnings, 1 info, 0 errors**.

## Out-of-plan ideas

- A future iteration could add `segments` (consecutive {from_cell, to_cell, length}) for fine-grained route analysis — defer until a concrete use case needs it.
