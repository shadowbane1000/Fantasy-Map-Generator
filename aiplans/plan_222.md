# Plan 222 — `find_markers_by_type`

## Goal

Add a read-only AI tool that lists every active marker whose
`marker.type` matches a caller-supplied string (case-insensitive exact
match, with an explicit `"untyped"` bucket for markers without a type).
Parallels `find_markers_in_area` without the spatial constraint and
complements `list_marker_types` (which only returns counts). One call
returns all markers of the asked-for type, ready to feed into
`get_marker_info` / `set_marker_type` / `set_marker_icon` / `move_marker`
/ `remove_marker`.

## Position in the tool surface

- `list_markers` → paginated enumeration of every marker with optional
  `type` / `pinned_only` filters.
- `list_marker_types` → summary counts per distinct `type` value.
- `find_nearest_marker` → single closest marker to a point, optionally
  filtered by type.
- `find_markers_in_area` → every marker inside a caller-supplied rect
  or circle, optionally filtered by type.
- **`find_markers_by_type`** → every marker of a given type, no spatial
  constraint. The many-marker, no-area companion to
  `list_marker_types`'s summary.

## Shape

### Inputs

- `type` (string, required). Case-insensitive exact match against
  `marker.type` after trimming whitespace.
  - An empty string, pure whitespace, or the literal `"untyped"`
    (case-insensitive) selects markers whose type is missing, null,
    non-string, empty, or whitespace-only — matching
    `list_marker_types`'s `UNTYPED_MARKER_BUCKET` semantics.
- `limit` (integer, optional, default 10000, max 100000) — caps the
  returned `markers` array. `count` still reports the full unlimited
  total.

### Output

```
{
  ok: true,
  type,         // the normalised type string the scan used ("castle", "untyped", …)
  markers: [{ i, type, icon, x, y, cell }],
  count,
}
```

- `type` on each hit is the marker's **original** `marker.type` string,
  preserving its casing (or `null` when the marker has no string type
  and the caller asked for `"untyped"`).
- `icon` is `marker.icon` when it's a string, else `null`.
- `x`, `y` are `marker.x` / `marker.y` when finite numbers, else `null`.
- `cell` is `marker.cell` when it's a finite integer, else `null`.
- `count` is the full unlimited total matching markers (even when the
  response `markers` array is truncated by `limit`).

### Error modes (structured `errorResult` — `ok: false`)

- `"not-ready"` — `pack` or `pack.markers` is missing.
- Invalid argument shapes: `type` missing / not a string; `limit` not
  an integer in `[1, 100000]`.

### Skipped markers (silently, not errors)

- Index-0 placeholder (`m.i === 0`).
- Null / undefined entries in the array.
- `m.removed === true`.

## Implementation notes

- `PackLike` interface declaring `markers?: RawMarker[]`.
- Normalised `type` filter is either a non-empty lowercased string or
  the sentinel `"untyped"` (after trimming).
- Match rule per marker:
  - When the filter is `"untyped"`: match if `m.type` is missing, not a
    string, empty, or whitespace-only.
  - Otherwise: `typeof m.type === "string" && m.type.trim().toLowerCase() === filter`.
- Pure scanner `findMarkersByTypeInPack(pack, query)` returns
  `FindMarkersByTypeResult = FindMarkersByTypePayload | "not-ready"`.
- Runtime seam: `FindMarkersByTypeRuntime` +
  `defaultFindMarkersByTypeRuntime` wraps
  `findMarkersByTypeInPack(getPack<PackLike>(), query)`.
- Factory `createFindMarkersByTypeTool(runtime?)` + exported
  `findMarkersByTypeTool = createFindMarkersByTypeTool()`.
- Constants `DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT = 10000`,
  `MAX_FIND_MARKERS_BY_TYPE_LIMIT = 100000`.
- Re-use `errorResult`, `okResult`, `getPack`, `type RawMarker` from
  `./_shared`, and the `UNTYPED_MARKER_BUCKET` sentinel from
  `./list-marker-types` so the two tools share the same language.

## Tests

Vitest file `find-markers-by-type.test.ts` in three describe blocks,
mirroring the `find_markers_in_area` / `list_marker_types` layout:

1. **Pure scanner**
   - Matches markers by type case-insensitively.
   - Preserves original casing in each hit's `type` field.
   - `"untyped"` bucket matches missing / empty / whitespace / non-
     string types and reports `type: null` for those hits.
   - Skips removed markers, `i === 0`, and null entries.
   - `limit` truncates `markers` but `count` reports the full total.
   - Empty result → `markers: []`, `count: 0`, `type` echoed.
   - `"not-ready"` when `pack` or `pack.markers` is missing.

2. **Tool surface**
   - Rejects missing / non-string / empty `type`.
     - Empty string and pure-whitespace string are both treated as
       `"untyped"` (accepted, not an error) to match the sentinel
       documented in `list_marker_types`.
   - Rejects out-of-range `limit` (0, > MAX, non-integer, non-number,
     negative).
   - Accepts `limit` at the boundaries (1 and MAX).
   - Accepts `type = "UNTYPED"` (case-insensitive sentinel).
   - Surfaces `"not-ready"` from the runtime as `errorResult` text.
   - Happy-path returns `{ok: true, type, markers, count}`.
   - `limit` honored end-to-end.
   - Exported `findMarkersByTypeTool` has the expected schema shape
     (`type` required, `limit` optional).
   - `DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT` / `MAX_*` constants exposed.

3. **`defaultFindMarkersByTypeRuntime` integration**
   - Stubs `globalThis.pack` via
     `globalThis as unknown as { pack?: unknown }`.
   - Asserts a typed query reads the real pack.
   - Asserts `"untyped"` query reads the real pack.
   - Stubbing `pack = undefined` → `"not-ready"` → tool surfaces
     structured error.

## Registration

- Import next to `findMarkersInAreaTool` in `src/ai/index.ts`.
- Re-export public API next to the `find-markers-in-area` re-export
  block.
- `registry.register(findMarkersByTypeTool)` immediately after
  `findMarkersInAreaTool` in `buildDefaultRegistry`.

## Docs

- New row in `README_AI.md`, placed between `find_markers_in_area`
  and `list_rulers`. Describes the exact matching rule, the
  `"untyped"` sentinel, `limit`, the response shape, and error modes.
  Ends with the `Requires an Anthropic API key (see "Getting an API
  key" below).` line so the row is API-key-aware.

## Verification

- `npm run build` succeeds (TS strict, no fallout).
- `npm test` — all existing tests plus the new file pass.
- `npm run lint` matches the baseline (7 warnings / 1 info / 0
  errors).

## Commit

`feat(ai): add find_markers_by_type tool` + 1-2 line body explaining
the type-only marker filter.
