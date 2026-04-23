# Plan 189 — `get_marker_info` AI tool

## Goal
Add a read-only AI tool that reports detailed info for a single marker
(point of interest — castle, battle site, mine, volcano, shipwreck, etc.)
— parallel to `get_state_info` / `get_burg_info` / `get_province_info`
/ `get_culture_info` / `get_religion_info` / `get_river_info` (the
per-entity drill-downs). Enables the AI to inspect a marker before
issuing any marker-targeted action (`set_marker_type`,
`set_marker_icon`, `set_marker_colors`, `set_marker_pin`,
`set_marker_pinned`, `set_marker_lock`, `set_marker_note`,
`set_marker_size`, `set_marker_icon_size`, `set_marker_shift`,
`move_marker`, `remove_marker`).

## Use case
Given a marker reference (numeric marker id or a case-insensitive
marker-note name like "Fort Blackstone"), return:
- `i` (marker id)
- `type` (free-form label grouping — `marker.type`; `null` when unset)
- `icon` (marker icon — `marker.icon`; `null` when unset)
- `x`, `y` (SVG pixel coords from `marker.x` / `marker.y`; each
  defaults to `0` when the underlying field isn't a finite number,
  matching `list_markers`' behaviour)
- `cell` (`marker.cell`; defaults to `0` when missing, again
  matching `list_markers`)
- `size` (pin size — `marker.size`; `null` when unset)
- `px` (icon size in px — `marker.px`; `null` when unset)
- `dx`, `dy` (horizontal / vertical icon shifts — `marker.dx` /
  `marker.dy`; `null` when unset)
- `colors`: `{ fill, stroke }` — from `marker.fill` / `marker.stroke`;
  each `null` when unset (callers can apply the
  `DEFAULT_MARKER_FILL` / `DEFAULT_MARKER_STROKE` defaults exported
  from `set-marker-colors.ts` if they want the rendered defaults).
- `pin` (pin shape — `marker.pin`; `null` when unset — matches the
  `DEFAULT_MARKER_PIN` from `set-marker-pin.ts` when absent)
- `pinned` (boolean — `!!marker.pinned`)
- `lock` (boolean — `!!marker.lock`)
- `note`: the related note from `window.notes` looked up by
  `id === "marker" + i`. Shape:
  `{ id, name, legend }` where
  - `id` is the raw note id string (`"marker{i}"`) or `null` when no
    note exists,
  - `name` is the display name or `null`,
  - `legend` is the legend text or `null`. To keep the response small,
    the legend is **truncated to 2000 chars** with a trailing `…` when
    longer (mirroring how the chat would truncate a long block of
    prose). An optional `legend_truncated: true` flag is surfaced when
    truncation happens.

Removed markers (`marker.removed === true`) surface `"not-found"`.

## Shape
- **Tool name**: `get_marker_info`
- **Inputs**:
  - `marker` (integer or string, required) — numeric marker id (> 0)
    OR the marker's current note name (case-insensitive). Resolved via
    `findMarkerNoteRef` (the same helper the `set_marker_*` tools use),
    which skips removed markers and requires an actual marker entry.
- **Output** (on success):
  ```
  {
    ok: true,
    i,
    type: string | null,
    icon: string | null,
    x, y, cell,
    size: number | null,
    px:   number | null,
    dx:   number | null,
    dy:   number | null,
    colors: { fill: string | null, stroke: string | null },
    pin: string | null,
    pinned: boolean,
    lock:   boolean,
    note: {
      id:     string | null,
      name:   string | null,
      legend: string | null,
      legend_truncated?: true
    }
  }
  ```
- **Errors**:
  - map not ready (no `pack` / no `pack.markers`) → `Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).`
  - `marker` missing / wrong type → `marker must be a positive integer id or a non-empty name string.` (via `parseEntityRef`)
  - no match / removed → `No marker found matching <ref>.`

## Runtime seam
```ts
export interface MarkerInfoRuntime {
  readMarker(ref: number | string): MarkerInfo | "not-ready" | "not-found";
}
export const defaultMarkerInfoRuntime: MarkerInfoRuntime = {
  readMarker(ref) { /* reads globalThis.pack + globalThis.notes */ }
};
```
Internally a pure helper
`readMarkerInfoFromPack(pack, notes, ref)` does the work without
touching globals so tests can exercise it directly. The helper does
NOT apply CSS color defaults — it echoes raw `marker.fill` /
`marker.stroke` (which may be `null` when unset). Legend truncation
lives inside the helper so its behaviour is testable in pure mode.

## Tests (Vitest, node env)
### Pure-function / seam block
1. Returns all fields for a fully populated fake marker +
   accompanying note (full legend intact).
2. Returns `null` for each optional field that is absent on the
   marker (`type`, `icon`, `size`, `px`, `dx`, `dy`, `pin`, colors).
3. `colors` echoes raw `marker.fill` / `marker.stroke`; either is
   `null` when unset.
4. `pinned` / `lock` default to `false` when missing, `true` when set.
5. `x` / `y` / `cell` default to `0` when absent (matches
   `list_markers`).
6. `note.id` / `note.name` / `note.legend` resolved from
   `window.notes` lookup by `"marker" + i`; all three `null` when
   no note exists.
7. Long legends truncated to 2000 chars with trailing `…` and
   `legend_truncated: true` flag; short legends pass through
   unchanged with no flag.
8. String-ref lookup by case-insensitive note name resolves via
   `findMarkerNoteRef`.
9. Unknown id returns `"not-found"`; string that doesn't match any
   marker-note name returns `"not-found"`; removed markers return
   `"not-found"`.
10. Returns `"not-ready"` when `pack` is missing or `pack.markers`
    is missing.

Schema / tool sanity:
11. Tool name is `get_marker_info`; `marker` is required.
12. Non-integer / missing marker → `parseEntityRef` error.
13. Unknown ref → structured error with the ref quoted in the
    message (`No marker found matching <ref>`).
14. `"not-ready"` surfaces a clear error at the tool layer.

### defaultRuntime integration block
Uses `(globalThis as unknown as { pack?: …; notes?: … })` writes +
`afterEach` restores, mirroring the `get_state_info` /
`get_province_info` tests.
1. Reads a real packed marker through the default runtime.
2. Returns `"not-ready"` when `pack` is missing → tool surfaces error.
3. Returns `"not-found"` for an unknown marker id.

## Registration
- Add `import { getMarkerInfoTool } from "./tools/get-marker-info";`
  in `src/ai/index.ts`.
- Add `registry.register(getMarkerInfoTool);` next to
  `registry.register(getRiverInfoTool);` / `getProvinceInfoTool`.
- Add a re-export block:
  `export { createGetMarkerInfoTool, defaultMarkerInfoRuntime,
    getMarkerInfoTool, type MarkerInfo, type MarkerInfoRuntime,
    readMarkerInfoFromPack } from "./tools/get-marker-info";`.

## README_AI.md
Add a row after the `get_province_info` row — same column shape
(description with API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2708 + N new tests, all pass.
- `npm run lint` — matches baseline (7 warnings / 1 info / 0 errors).

## Risks / non-goals
- We do NOT default marker colors / pin / size at the helper layer.
  The caller can look at `DEFAULT_MARKER_FILL` / `_STROKE` /
  `DEFAULT_MARKER_PIN` / `DEFAULT_MARKER_SIZE` /
  `DEFAULT_MARKER_ICON_SIZE` / `DEFAULT_MARKER_SHIFT` (already
  exported from the matching set-*  tools) if it wants the rendered
  defaults. Reporting raw `null` lets the AI distinguish "user never
  set this" from "explicitly set to the default value".
- We do NOT try to resolve the marker's cell-level state / culture /
  religion / province — `get_cell_info({ cell: marker.cell })` exists
  for that cross-walk. Mirroring the existing `list_markers` output
  keeps the shape predictable.
- Legend truncation keeps the chat response compact; the full legend
  is still reachable through `list_notes` / the Notes Editor.
