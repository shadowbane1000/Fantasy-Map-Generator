# Plan 27 — Use Case: List markers (points of interest)

## Status

Iteration 27. 26 AI tools. Baseline 7 warnings / 1 info / 0 errors.
341 tests pass.

## Use Case

**"List the markers (points of interest) on the current map."**

The user sees these in the Markers Overview panel (castles,
battle sites, mines, etc.). Marker data lives in `pack.markers`;
display names + lore are in `window.notes[]`, keyed by
`note.id === "marker" + marker.i` (see
`public/modules/ui/markers-overview.js:228-239` and
`src/modules/markers-generator.ts:510-518`).

Marker fields at runtime (interface at
`src/modules/markers-generator.ts:35-44` is narrower than actual
shape — the generator adds `x`, `y` when it creates markers via
`addMarker`):

- `i` — id.
- `type` — category ("castle", "mine", "battlefield", …).
- `icon` — the glyph shown on the map.
- `cell` — which cell the marker sits on.
- `x`, `y` — map coordinates (derived from the cell / host burg at
  creation time).
- `pinned` — optional: marker pinned in the overview.
- `lock` — optional: marker locked from regeneration.

Prompts:
- *"List the markers."*
- *"Show me all the castles."*
- *"Which points of interest are in the south?"* (the model can
  filter after reading.)

### Success criteria

1. `list_markers()` returns `{ok, total, limit, offset, filters,
   markers}`. Each entry:
   `{i, type, icon, name, legend, x, y, cell, pinned, lock}`.
2. `name` + `legend` resolved from `notes[]` (`marker{i}`), null when
   missing.
3. Optional `type` filter (case-insensitive, exact match on
   `marker.type`).
4. Optional `pinned_only: boolean`.
5. Paginated: limit 1–500 (default 100), offset ≥ 0.
6. Graceful error when `pack.markers` is missing.

## Scope

In-scope:
- `list_markers` tool via `createPaginatedListTool`.
- Pure `readMarkersFromPack(pack, notes)` helper.
- Registry + README + tests.

Out-of-scope:
- Adding / renaming / deleting markers (future).
- Notes-editor-style markdown legends (we just return the string).

## Design

New file: `src/ai/tools/list-markers.ts`.

```ts
export interface MarkerSummary {
  i: number;
  type: string | null;
  icon: string | null;
  name: string | null;
  legend: string | null;
  x: number;
  y: number;
  cell: number;
  pinned: boolean;
  lock: boolean;
}
export interface MarkersRuntime {
  readMarkers(): MarkerSummary[] | null;
}
```

Default runtime:
- `readMarkers()` — reads `window.pack.markers` and `window.notes`.
  Skips markers with `removed: true` (defensive, not currently set).
  Returns `null` if `pack.markers` is missing.

Pure helper `readMarkersFromPack(pack, notes)` does the field mapping
and note lookup.

Filters in `parseFilters`:
- `type?: string` — non-empty string, case-insensitive exact.
- `pinned_only?: boolean`.

## Files

Create: `plan_27.md`, `tasks_27.md`,
`src/ai/tools/list-markers.ts`,
`src/ai/tools/list-markers.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`list-markers.test.ts`):

1. Full list default paging.
2. Paging honored (limit/offset).
3. Invalid paging rejected.
4. `type: "castle"` filters markers of type "castle" (case-insensitive).
5. `pinned_only: true` filters pinned markers.
6. Invalid filter types rejected (non-string type, non-boolean
   pinned_only).
7. Runtime null → error.

Pure-helper tests:

8. `readMarkersFromPack` resolves name + legend from notes; falls
   back to null when the note is missing.
9. Skips markers with `removed: true` (defensive).
10. Returns null when pack.markers is missing.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test. Reuses the `createPaginatedListTool`
factory — new tool file is ~100 lines.

Lint / test / build gates in tasks_27.md.
