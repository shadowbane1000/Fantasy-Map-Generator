# Plan 198 — add `find_nearest_river` AI tool

## Goal
Add a read-only AI tool that returns the nearest non-removed river to
a query point (either an `(x, y)` coordinate pair or a `cell` id).
Direct parallel of `find_nearest_burg` / `find_nearest_marker`, but
targeting `pack.rivers`.

## Why
Agents can already find the nearest **burg** (`find_nearest_burg`) or
**marker** (`find_nearest_marker`) to a point. There is no equivalent
for **rivers** — a very useful signal when reasoning about a region's
water access (trade, settlement viability, aqueducts, mills, …).
Given a region / cell of interest, the LLM needs a cheap way to
locate the relevant river before calling tools such as
`get_river_info`, `rename_river`, `set_river_type`, `set_river_width`,
or `remove_river`.

## Shape

Tool name: `find_nearest_river`

Input (exactly one of `(x, y)` or `cell`):
- `x` (number) — x coord of the query point. Paired with `y`.
  Mutually exclusive with `cell`.
- `y` (number) — y coord of the query point. Paired with `x`.
  Mutually exclusive with `cell`.
- `cell` (integer, >= 0) — packed cell index whose centroid
  (`pack.cells.p[cell]`) is the query point. Mutually exclusive
  with `x` / `y`.

Behavior:
- Read-only.
- Validate input.
- Validate `pack.rivers` is present (`not-ready`).
- Resolve query point from `cell` via `pack.cells.p[cell]`, or from
  `(x, y)`.
- Iterate `pack.rivers`, skip entries with `removed: true`, skip the
  placeholder entry `i === 0` (guard only: removed rivers may still
  share id 0).
- For each remaining river, compute the Euclidean distance to the
  closer of its `source` / `mouth` cell centroids (read from
  `pack.cells.p[cellI]`). **Source and mouth only** — this is an
  approximation of the "nearest point on the river" described in the
  wiki. Scanning every `river.cells[]` entry would be more precise
  but (a) that field is not always populated after load, (b) the
  linear scan is meant to stay cheap, and (c) burgs / markers use a
  single point too, so this keeps parity.
- Return `{ ok, i, name, distance, x, y }` for the winner, with `x`
  / `y` being the coords of whichever endpoint (source or mouth) won
  the per-river min. Or `{ ok: true, i: null, name: null,
  distance: null, x: null, y: null }` if no river matched.

## Files

- `src/ai/tools/find-nearest-river.ts` — runtime-seam tool.
- `src/ai/tools/find-nearest-river.test.ts` — pure / seam tests plus
  `defaultFindNearestRiverRuntime` integration block (sets
  `globalThis.pack`).
- `src/ai/index.ts` — import, register, re-export.
- `README_AI.md` — add row near `find_nearest_burg` /
  `find_nearest_marker`.

## Architecture

Mirror `find-nearest-burg.ts` / `find-nearest-marker.ts`:

- `export interface FindNearestRiverHit { i: number; name: string;
  x: number; y: number; distance: number }`
- `export type FindNearestRiverQuery =
     | { kind: "coords"; x: number; y: number }
     | { kind: "cell"; cell: number }`
- `export type FindNearestRiverOutcome = FindNearestRiverHit | {
     i: null; name: null; x: null; y: null; distance: null }`
- `export type FindNearestRiverResult = FindNearestRiverOutcome |
     "not-ready" | "out-of-bounds" | "no-cell-point"`
- `export function findNearestRiverInPack(pack, query):
     FindNearestRiverResult`
- `export interface FindNearestRiverRuntime {
     findNearest(query): FindNearestRiverResult }`
- `export const defaultFindNearestRiverRuntime` — reads from
  `getPack<PackLike>()` via `_shared/globals.ts`.
- `export function createFindNearestRiverTool(runtime = default): Tool`
- `export const findNearestRiverTool = createFindNearestRiverTool()`

`PackLike`:
```
{
  rivers?: RawRiver[];
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}
```

Input schema (no top-level `required[]` — oneOf logic is runtime):
```
{
  x: number,
  y: number,
  cell: integer (minimum 0),
}
```

Per-river distance: for each active river, look at the cells it knows
about (`river.source` and `river.mouth`), compute Euclidean distance
from the query point to each, and take the minimum. A river whose
`source` and `mouth` are both missing / have no `pack.cells.p` entry
is skipped (counted as "no usable endpoint").

## Validation / edge cases

- `pack` / `pack.rivers` missing → `"not-ready"`.
- Neither `(x, y)` nor `cell` → input error.
- Both `(x, y)` and `cell` → input error.
- Partial coords (only `x` or only `y`) → input error.
- Non-finite `x` / `y` → input error.
- `cell` not a non-negative integer → input error.
- `cell` out of bounds (`>= pack.cells.i.length`) → `"out-of-bounds"`.
- `cell` with no coords in `pack.cells.p` → `"no-cell-point"`.
- No matching river (empty `pack.rivers`, all removed, all with
  missing source / mouth) → `{ ok: true, i: null, ... }`.

## Tests

Pure / seam:
- coordinate query returns the closest active river (source or
  mouth, whichever is closer).
- cell query resolves `pack.cells.p[cell]` then returns closest.
- skips removed rivers.
- skips `i === 0` placeholder.
- endpoint choice: the returned `x` / `y` match whichever of source
  or mouth is nearest to the query.
- breaks ties deterministically by iteration order (source beats
  mouth of the same river at equal distance; first river beats
  second at equal overall distance).
- distance is Euclidean from the query point.
- returns `{ i: null, ... }` when `pack.rivers` is empty / all
  removed.
- returns `{ i: null, ... }` when no river has usable source or
  mouth coords.
- `"not-ready"` when pack / rivers missing.
- `"out-of-bounds"` when cell >= cells.i.length.
- `"no-cell-point"` when cells.p[cell] is undefined.

Tool surface:
- rejects both / neither / partial input.
- rejects non-finite `x` / `y`.
- rejects non-integer / negative `cell`.
- surfaces `"not-ready"` / `"out-of-bounds"` / `"no-cell-point"` as
  structured errors (runtime stubs).
- returns `ok: true, i: null, ...` when no active rivers.
- happy path returns `{ ok: true, i, name, x, y, distance }`.
- schema spot-check (properties + no top-level required).

Integration (`defaultFindNearestRiverRuntime`):
- with `globalThis.pack` seeded, reads a real pack for coord query.
- cell-form query through default runtime.
- `globalThis.pack = undefined` → tool returns "not ready"
  structured error.

## Verification

- `npm run lint` — must match baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must succeed.
- `npm test` — all pass; test count goes up by the new suite count.

## Out of scope

- Scanning every cell in `river.cells[]` for a truly-nearest point.
  The source/mouth approximation is documented in the description so
  callers know what to expect.
- Filters by basin / type / min length. `list_rivers` already
  supports those; this tool is a geometry primitive.
- Multiple matches / sorted top-N. Use `list_rivers` (paginated) for
  bulk needs.
