# Plan 221 — `find_rivers_in_area`

## Goal

Add a read-only AI tool that lists every non-removed river whose mouth
cell centroid (`pack.cells.p[river.mouth]`) lies inside a caller-
specified rectangular or circular area. Parallels `find_burgs_in_area`
and `find_markers_in_area` exactly, and is the many-river companion to
`find_nearest_river` (which already measures rivers by their source /
mouth endpoints).

## Position in the tool surface

- `list_rivers` → enumerate the universe with pagination + basin / flow
  filters.
- `find_nearest_river` → find the single closest river to a point.
- **`find_rivers_in_area`** → bulk spatial filter: every river whose
  mouth falls inside a rect or circle. First step before feeding river
  ids into `get_river_info`, `rename_river`, `set_river_type`,
  `set_river_width`, `remove_river`, or `regenerate_river_names`.

## River "position" choice

Rivers don't have a single canonical (x, y) — they are path-shaped. For
area-filter purposes we need one representative point per river, and
the two natural candidates are the **mouth** (where the river meets the
sea / a lake / a larger river) and the **source** (headwaters). The
tool will use the **mouth** as the river's position and document that
choice. Reasoning:

- Mouths are the most recognisable anchor for humans picking an area
  ("rivers ending inside this bay"), and they're where `get_river_info`
  already focuses.
- `find_nearest_river` already considers both source and mouth, so
  callers who need source-based area filtering can still reach for it.
- The data-model wiki lists mouth as the primary river coordinate used
  by downstream UI.

The mouth cell id is `river.mouth`; its centroid is
`pack.cells.p[river.mouth]`, matching `find_nearest_river`'s existing
`readCellCoords` pattern.

## Shape

### Inputs (mirrors `find_markers_in_area` minus the type filter)

Mutually exclusive area forms:

- **Rectangle**: `x1`, `y1`, `x2`, `y2` (finite numbers, any corner
  order — normalised to `x1 <= x2`, `y1 <= y2`).
- **Circle**: `radius` (finite number >= 0) plus center as either
  `x` + `y` (both finite numbers) OR `cell` (non-negative integer,
  resolved via `pack.cells.p[cell]`).

Optional:

- `limit` (integer in `[1, 100000]`, default 10000) — caps the returned
  `rivers` array. `count` still reports the full unlimited total.

No `type` filter (rivers have a `type` field but it's mostly
cosmetic — callers can filter the result in the prompt if they need
to, keeping parity with `list_rivers`'s already-paginated flow).

### Output

```
{
  ok: true,
  rivers: [{ i, name, x, y, distance }],
  count,
  area,
}
```

Where:

- `x`, `y` — the mouth cell centroid (`pack.cells.p[river.mouth]`).
- `distance` — Euclidean pixels from the circle center for circle
  queries, `null` for rectangle queries.
- `area` — the normalised area the scan used (`{kind: "rect", x1, y1,
  x2, y2}` or `{kind: "circle", x, y, radius}`).

### Error modes (structured `errorResult` — `ok: false`)

- `"not-ready"` when `pack` / `pack.rivers` is missing.
- `"out-of-bounds"` for `cell` >= `cells.i.length` / < 0.
- `"no-cell-point"` when `pack.cells.p[cell]` is undefined / malformed.
- Invalid argument shapes: both area forms supplied, neither supplied,
  incomplete rectangle, non-finite numbers, missing / negative /
  non-finite `radius`, out-of-range `limit`, mixed circle center
  (both `(x, y)` and `cell`), missing x or y, non-integer / negative
  `cell`.

### Skipped rivers (silently, not errors)

- Index-0 placeholder (`r.i === 0`).
- `r.removed === true`.
- Rivers whose `mouth` isn't a number.
- Rivers whose `pack.cells.p[r.mouth]` isn't a `[number, number]`
  tuple.

## Implementation notes

- Single `PackLike` interface declaring `rivers?: RawRiver[]` and
  `cells?: { i?: ArrayLike<number>; p?: ArrayLike<[number, number] |
  undefined> }`.
- `resolveCircleCenter(pack, query)` mirrors the analog tools — the
  same four-outcome return.
- `resolveMouthPoint(pack, mouth)` helper mirrors
  `find-nearest-river`'s `readCellCoords`. Returns `[x, y]` or `null`.
- Pure scanner `findRiversInAreaInPack(pack, query)` returns
  `FindRiversInAreaResult = FindRiversInAreaPayload | "not-ready" |
  "out-of-bounds" | "no-cell-point"`.
- Runtime seam: `FindRiversInAreaRuntime` +
  `defaultFindRiversInAreaRuntime` wraps
  `findRiversInAreaInPack(getPack<PackLike>(), query)`.
- Factory `createFindRiversInAreaTool(runtime?)` + exported
  `findRiversInAreaTool = createFindRiversInAreaTool()`.
- Constants `DEFAULT_FIND_RIVERS_IN_AREA_LIMIT = 10000`,
  `MAX_FIND_RIVERS_IN_AREA_LIMIT = 100000`.
- Re-use `errorResult`, `okResult`, `getPack`, and `type RawRiver` from
  `./_shared`.

## Tests

Vitest file `find-rivers-in-area.test.ts` in three describe blocks,
following the `find_markers_in_area` test layout:

1. **Pure scanner**
   - Rect inclusive edges, reversed-corner normalisation, rect
     distance is null.
   - Circle-coords happy-path + distance populated.
   - Circle-cell resolves center via `pack.cells.p[cell]`.
   - Radius 0 matches only mouths exactly at center.
   - `limit` truncates `rivers` but `count` is the full total.
   - Skips removed rivers, skips rivers missing `mouth` or mouth
     without coords, skips `i === 0` placeholder.
   - Empty result → `rivers: []`, `count: 0`.
   - `"not-ready"` when `pack` / `pack.rivers` missing.
   - Circle-cell `"out-of-bounds"` and `"no-cell-point"` error modes.

2. **Tool surface**
   - Rejects missing area, mixed area forms, incomplete rect,
     non-finite rect corners, circle with both `(x,y)` and `cell`,
     circle with neither, circle missing one of x / y, non-finite x /
     y, non-integer / negative `cell`, missing / non-finite / negative
     `radius`, out-of-range `limit`.
   - Accepts `radius = 0`.
   - Surfaces `"not-ready"` / `"out-of-bounds"` / `"no-cell-point"`
     from the runtime as `errorResult` text.
   - Happy-path rect and circle return `{ok: true, rivers, count,
     area}`.
   - `limit` honored end-to-end.
   - Exported `findRiversInAreaTool` has the expected schema shape.
   - `DEFAULT_FIND_RIVERS_IN_AREA_LIMIT` / `MAX_*` constants exposed.

3. **`defaultFindRiversInAreaRuntime` integration**
   - Stubs `globalThis.pack` (cast via
     `globalThis as unknown as { pack?: unknown }`).
   - Asserts rectangle + circle-coords + circle-cell queries all read
     the global.
   - Stubbing `pack = undefined` → `"not-ready"` → tool surfaces
     structured error.

## Registration

- Import next to `findMarkersInAreaTool` in `src/ai/index.ts`.
- Re-export public API (constants, types, runtime, scanner, factory,
  singleton) next to the `find-markers-in-area` re-export block.
- `registry.register(findRiversInAreaTool)` immediately after
  `findNearestRiverTool` in `buildDefaultRegistry`.

## Docs

- New row in `README_AI.md`, placed between `find_nearest_river` and
  `list_biomes`. Full description text parallels `find_markers_in_area`
  but for rivers, explicitly noting the mouth-based position and
  pointing to `find_nearest_river` for source-based proximity. Ends
  with `Requires an Anthropic API key (see "Getting an API key"
  below).`.

## Verification

- `npm run build` succeeds (TS strict, no fallout).
- `npm test` — all existing tests plus the new file pass.
- `npm run lint` matches the baseline (7 warnings / 1 info / 0
  errors).

## Commit

`feat(ai): add find_rivers_in_area tool` + a 1-2 line body explaining
the mouth-based spatial filter.
