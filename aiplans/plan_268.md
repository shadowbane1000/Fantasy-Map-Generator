# Plan 268 — `get_marker_distribution`

## Goal
Add a read-only AI tool `get_marker_distribution` that groups active markers by `marker.type` with per-type counts and percentages.

This is parallel to `list_marker_types` (which returns counts only) and `get_burg_distribution` (direct distribution analog).

## Semantics

- Takes no parameters.
- Iterates `pack.markers`; skips:
  - `null` / `undefined` entries
  - `marker.i === 0` (index-0 placeholder)
  - `marker.removed === true`
- Group key (`marker.type`):
  - non-empty, non-whitespace string → the original (case-preserved) string
  - otherwise (missing / non-string / empty / whitespace-only) → sentinel `"untyped"` (reuse `UNTYPED_MARKER_BUCKET` from `list-marker-types.ts`).
- Per bucket output:
  - `type: string`
  - `count: number`
  - `percentage: number` — `count / total_markers * 100`, floating; `0` when `total_markers === 0`.
- Sort `by_type` by `count` descending; ties broken by `type` ascending (case-sensitive — matches `list_marker_types`).
- Return `{ ok, total_markers, by_type }`.
- Returns not-ready error when `pack` or `pack.markers` is missing.

## Files to add/change

1. `./src/ai/tools/get-marker-distribution.ts` — runtime-seam pattern mirroring `get-burg-distribution.ts`:
   - Exported pure scanner `readMarkerDistributionFromPack(pack)`.
   - `MarkerDistributionRuntime` interface.
   - `defaultMarkerDistributionRuntime` uses `getPack<MarkerDistributionPackLike>()`.
   - `createGetMarkerDistributionTool(runtime)` factory returning a `Tool`.
   - `getMarkerDistributionTool` singleton export.
2. `./src/ai/tools/get-marker-distribution.test.ts` — unit + defaultRuntime integration block.
3. `./src/ai/index.ts` — add import + registry call + type/value re-exports.
4. `./README_AI.md` — add row near `get_burg_distribution`.

## Test plan

- Pure scanner tests:
  - `null` / empty / missing pack → `"not-ready"`.
  - Empty markers array → `{ total_markers: 0, by_type: [] }`.
  - Groups typed markers, sorts count desc.
  - Tiebreak by type ascending (case-sensitive).
  - Preserves original casing (distinct buckets for `"Castle"` / `"castle"` / `"CASTLE"`).
  - Missing / empty / whitespace / non-string type → `"untyped"` bucket.
  - Skips `removed: true`.
  - Skips `i === 0`.
  - Tolerates null entries.
  - Percentages sum to ~100; individual percentages equal `count / total * 100`.
- Tool surface:
  - No-args / `{}` / `null` / `undefined` all accepted.
  - Ignores unrelated extra input keys.
  - Not-ready error surfaces `isError: true` + `ok: false`.
  - Schema: empty properties, no required.
- Default runtime integration:
  - Mutates `globalThis.pack`, asserts tool reads live state.
  - Surfaces not-ready when `globalThis.pack` is cleared / missing markers.

## Constraints

- Read-only; no mutation.
- Reuse `UNTYPED_MARKER_BUCKET` from `list-marker-types.ts` (do NOT duplicate-export; use a local import and cite/export no new copy).
- Use `as unknown as { ... }` casts in tests where needed.
- Lint baseline: 7 warnings / 1 info / 0 errors. Must match after change.
