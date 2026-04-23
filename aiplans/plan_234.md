# Plan 234 — `find_coast_cells` AI Tool

## Goal

Add a new AI tool `find_coast_cells` that lists packed-grid cells lying on the
coast — either the land side (`pack.cells.t[i] === 1`, i.e. `LAND_COAST`), the
water side (`pack.cells.t[i] === -1`, i.e. `WATER_COAST`), or both (`t !== 0`,
which in a fully marked-up map also covers `LANDLOCKED`/`DEEP_WATER` bands —
but we restrict "all coast" to the ±1 layer by default and let `side="all"`
return the union of ±1, matching the spec).

## Background

`pack.cells.t` is the "distance field" maintained by
`src/modules/features.ts`:

- `+1` = `LAND_COAST` (land cell with at least one water neighbor).
- `-1` = `WATER_COAST` (water cell with at least one land neighbor).
- `+2` = `LANDLOCKED` (land, one step inland from coast).
- `+3…` = `DEEPER_LAND` (further inland).
- `-2` = `DEEP_WATER`.
- `0` = unmarked (only for empty / non-generated maps).

The coast proper is exactly `±1`. This makes the tool a simple sign-filter
over `pack.cells.t` and avoids walking neighbor lists — simpler than the
naive `cells.h >= 20 && any neighbor h < 20` formulation.

## Tool surface

- Name: `find_coast_cells`.
- Inputs:
  - `side` (optional string, case-insensitive): one of `"land"` (default),
    `"water"`, `"all"`.
    - `"land"` → `t === 1`.
    - `"water"` → `t === -1`.
    - `"all"` → `t === 1 || t === -1` (i.e. `Math.abs(t) === 1`).
  - `limit` (optional integer, default `10000`, max `100000`): caps the
    returned `cells` array; `count` still reports the full unlimited total.
- Output: `{ ok, side, cells, count }`.
- Errors: un-generated map (missing `pack` / `pack.cells` / `pack.cells.t`),
  invalid `side` string, invalid `limit`.
- Read-only — does not mutate state or trigger redraws.

## Implementation

1. `src/ai/tools/find-coast-cells.ts`
   - Export `DEFAULT_FIND_COAST_CELLS_LIMIT = 10000` and
     `MAX_FIND_COAST_CELLS_LIMIT = 100000`.
   - Export `type FindCoastSide = "land" | "water" | "all"`.
   - Pure collector `findCoastCellsInPack(pack, side, limit)` returning
     `{ cells, count } | "not-ready"`.
   - Runtime seam: `FindCoastCellsRuntime`,
     `defaultFindCoastCellsRuntime` (reads from `getPack()`).
   - `createFindCoastCellsTool(runtime?)` factory returning a `Tool` with
     input schema (`side` enum with three values, optional; `limit` optional
     integer).
   - Default export `findCoastCellsTool`.
2. `src/ai/tools/find-coast-cells.test.ts`
   - Pure collector tests: land default, water, all, limit truncation,
     empty match, `not-ready` variants.
   - Tool surface tests: happy paths for each `side`, default side is
     `"land"`, case-insensitive side, invalid side rejected, invalid
     limit rejected, not-ready propagated.
   - `defaultFindCoastCellsRuntime` integration block that seeds
     `globalThis.pack` with a fake pack (using `as unknown as` casts).
3. `src/ai/index.ts`
   - Add import, register call next to `findCellsByBiomeTool`, and
     export block mirroring siblings.
4. `README_AI.md`
   - Add a row immediately after `find_cells_by_biome` describing
     semantics, inputs, outputs, gotchas (note the `±2` / deep layers are
     NOT returned), API-key disclaimer, and example prompts.

## Non-goals

- Do not return near-coast cells (`±2`) — out of scope; users can compose
  with `find_cells_adjacent_to_entity` or walk `pack.cells.c` manually.
- Do not derive coast from `pack.cells.h` neighbor scans — `t` is already
  the authoritative signal maintained by `markupPack`.
- No mutation, redraw, or rendering.

## Verification

- `npm run build` succeeds.
- `npm test` all pass; adds ~20 tests.
- `npm run lint` matches baseline: 7 warnings / 1 info / 0 errors.
