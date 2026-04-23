# Plan 239 — AI Tool: `find_burgs_by_feature`

## Status

Iteration 239 of the Ralph loop. Baseline (pre-change):
- Lint: 7 warnings, 1 info, 0 errors.
- Tests: 250 test files / 3990 tests passing.

## Use Case

**"List every burg sitting on a given map feature (continent, island, lake, ocean)."**

This is the feature-filtered parallel of `find_burgs_by_state` /
`find_burgs_by_culture` / `find_burgs_by_religion`. It's the bulk
counterpart to `get_feature_info` (which reports the feature metadata
but no burg list). Useful for:

- Auditing / renaming every burg on a specific island or continent.
- Cross-referencing `get_cell_info`'s `feature` ref with the burgs that
  live on it.
- Feeding burg ids into `get_burg_info`, `rename_burg`, `move_burg`,
  `set_burg_population` for feature-scoped bulk operations.

### Matching

A burg's feature is determined **via its cell**: burgs do not carry a
direct `feature` field in the sense of the canonical per-cell
assignment. The tool must read `pack.cells.f[burg.cell]` and compare
with the requested `featureI`. This mirrors how `find_burgs_by_religion`
goes through `pack.cells.religion[burg.cell]` rather than a field on
the burg itself.

(Note: `burg.feature` does exist in the save-file schema but is a
derived pointer that isn't authoritative in every code path — the
canonical per-cell data lives in `pack.cells.f`, which is what
`get_cell_info` uses and what our tool will use for consistency with
the rest of the AI toolset.)

## Success Criteria

1. New tool `find_burgs_by_feature` registered in `src/ai/index.ts`.
2. Accepts:
   - Required `feature` — integer >= 1 (the feature id in `pack.features`;
     `pack.features[0]` is a sentinel placeholder and is rejected with a
     clear error).
   - Optional `limit` — integer in `[1, 100000]`, default `10000`.
3. Resolves `feature` via `pack.features[featureI]`, accepting the
   resolved `{ i, type, name }` shape to echo back in the response
   (a feature may have `null` name — some oceans are unnamed; we echo
   `null` rather than an empty string).
4. Iterates `pack.burgs`, skipping `i=0` placeholder and `removed: true`
   entries, comparing `pack.cells.f[burg.cell] === featureI`.
5. Returns:
   ```json
   {
     "ok": true,
     "feature": { "i": 3, "type": "island", "name": "Verdant Isle" },
     "burgs": [
       { "i": 1, "name": "...", "x": 100, "y": 200, "population": 12.5, "capital": true },
       ...
     ],
     "count": 42
   }
   ```
   `count` is the full unlimited total even when `burgs` is truncated by
   `limit`.
6. Error cases (all as `{ok:false, error: "..."}` via `errorResult`):
   - `pack` or `pack.burgs` or `pack.cells.f` or `pack.features` missing
     → "Map is not ready yet. ...".
   - `feature` missing / not an integer / `<= 0` → input-validation error.
   - `feature` out of range or slot empty → `No feature found matching ...`.
   - `limit` not an integer in `[1, 100000]` → validation error.
7. Empty result (feature exists, has no burgs) → `ok: true`, `burgs: []`,
   `count: 0`.
8. Read-only: no mutation of `pack`.
9. Exported from `src/ai/index.ts` matching the existing
   `find_burgs_by_religion` / `find_burgs_by_state` export shape.

## Non-goals

- No new schema additions to `PackedGraph` — we use permissive
  `PackLike` interfaces inside the tool file (matching existing style).
- Not handling `burg.feature` directly — we go through `pack.cells.f`
  for consistency with other cell-indirected queries.
- No UI changes.

## References

- `src/ai/tools/find-burgs-by-religion.ts` + test — direct analog (also
  cell-indirected). Same structure: pure scanner + runtime seam +
  `createX` factory + `defaultRuntime` + default tool export.
- `src/ai/tools/get-feature-info.ts` — feature resolution logic,
  rejects `featureId <= 0`, validates the slot object.
- `src/ai/tools/_shared/index.ts` — helpers (`errorResult`, `okResult`,
  `getPack`, `RawBurg`).
- `src/ai/tools/list-features.ts` — permissive feature array shape.

## Verification

- Lint baseline restored: 7 warnings / 1 info / 0 errors.
- `npm run build` succeeds.
- `npm test` all pass (test count grows by the new file's assertions).
- New test file covers: pure scanner happy-paths (multi-feature,
  no cross-contamination, empty list), skip rules (placeholder, removed,
  missing cell, out-of-bounds), limit/count semantics, resolver
  behaviour (valid id, invalid/missing/out-of-range ids, placeholder 0,
  empty slot), tool surface (numeric + validation errors, `not-ready`
  surfaced from both resolve and find), default runtime integration
  (beforeEach/afterEach toggling `globalThis.pack`).
