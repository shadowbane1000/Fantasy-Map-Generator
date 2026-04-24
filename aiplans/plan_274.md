# Plan 274 — `focus_on_entity` AI tool

## Goal

Add a new AI tool `focus_on_entity` that zooms/pans the SVG viewport to fit the full extent of a state / province / culture / religion / biome. Generalizes the existing `focus_on_map` (which zooms to a single point — a burg's coords or a state's pole — at a fixed zoom level) by accepting any multi-domain entity and computing a fit-to-bbox scale so the whole territory is visible.

## Use case

Answer questions like:

- "Zoom to the Highlanders culture."
- "Fit the Forest biome in the viewport."
- "Focus on province Rookmark."
- "Show me the full extent of religion Stormcult."
- "Focus on state 3 with 100px padding."

## Contract

- Required `entity_type` (case-insensitive string, one of `state` / `province` / `culture` / `religion` / `biome`).
- Required `entity` (positive integer id — non-negative for biome, where `0 = Marine` — OR case-insensitive name / fullName). Resolved via the shared `findEntityByRef` for the first four types and `findBiomeByRef` for biomes. Skips the index-0 placeholder (except for biome) and `removed: true` entries / `"removed"` biome sentinel.
- Optional `padding` (integer in [0, 10000], default 50). Extra pixel margin around the bbox used when computing the zoom scale.
- Computes the bbox by reusing `collectEntityBbox` from `get-entity-bbox.ts`.
- Computes a fit scale as `min(svgWidth / (bbox.width + 2*padding), svgHeight / (bbox.height + 2*padding))`, clamped to a minimum (1) and the existing `FOCUS_ZOOM_LEVEL` max from `focus-on-map.ts` (8). For a zero-size bbox (single cell), uses `FOCUS_ZOOM_LEVEL`.
- Calls the existing legacy helper `window.zoomTo(cx, cy, scale, duration)` via the runtime seam (same helper `focus_on_map` uses). `duration` mirrors `FOCUS_ZOOM_DURATION` (2000ms).
- Returns `{ ok, entity_type, i, name, bbox: {x_min, y_min, x_max, y_max, width, height, cx, cy}, padding }`.
- Errors on invalid `entity_type`, missing / unresolvable `entity`, out-of-range `padding`, an un-generated map (pack / cells missing), or an entity that has zero member cells (no bbox to fit — `cells_count === 0` returned by `collectEntityBbox`).

## Design

Mirrors the runtime-seam pattern from `focus-on-map.ts` and `get-entity-bbox.ts`:

1. Reuse `collectEntityBbox` from `./get-entity-bbox` for the pure bbox computation (zero duplication).
2. `FocusOnEntityRuntime` seam with two methods:
   - `collect(type, ref)` — returns the same `CollectEntityBboxResult` type from `get-entity-bbox`.
   - `zoomTo(x, y, z, d)` — wraps `window.zoomTo` (identical shape to the one in `focus-on-map.ts`).
   - `getViewport()` — returns `{ width, height }` read from `window.svgWidth` / `window.svgHeight` (legacy globals used by the existing `zoomTo`). Falls back to `window.graphWidth` / `window.graphHeight`, then to reasonable defaults (1000 x 1000) so tests can stub cleanly.
3. `defaultFocusOnEntityRuntime` built from `getPack` + `getGlobal<BiomesDataLike>("biomesData")` + live `window.zoomTo` + `getGlobal<number>("svgWidth"/"svgHeight")`.
4. `createFocusOnEntityTool(runtime)` factory producing the `Tool` and the default module-level `focusOnEntityTool` constant.
5. Pure helper `computeFitScale(bboxWidth, bboxHeight, viewportWidth, viewportHeight, padding, maxScale)` — deterministic, unit-testable.

Reuses `ADJACENT_ENTITY_TYPES` / `AdjacentEntityType` from `find-adjacent-entities`. Reuses `FOCUS_ZOOM_LEVEL` and `FOCUS_ZOOM_DURATION` from `focus-on-map`. No new shared constants (no duplicate exports).

## Files

- New `src/ai/tools/focus-on-entity.ts` — runtime, compute-fit-scale helper, tool factory, default instance.
- New `src/ai/tools/focus-on-entity.test.ts` — pure helper suite, tool-surface suite, and a `defaultFocusOnEntityRuntime (integration)` block that stubs `globalThis.pack` / `globalThis.biomesData` / `globalThis.zoomTo` / `globalThis.svgWidth` / `globalThis.svgHeight` (with `as unknown as { ... }` casts) to exercise the default seam.
- Edit `src/ai/index.ts`:
  - Import `focusOnEntityTool` alongside `focusOnMapTool`.
  - Re-export all new public members (type-only + values).
  - `registry.register(focusOnEntityTool)` near `focusOnMapTool`.
- Edit `README_AI.md`: add one `focus_on_entity` row near `focus_on_map`, with API-key pointer and sample questions.

## Tests

Pure `computeFitScale`:

- Viewport larger than bbox → scale clamps to `maxScale`.
- Viewport smaller than bbox in width only → scale matches width ratio.
- Viewport smaller than bbox in height only → scale matches height ratio.
- Zero-size bbox → returns `maxScale`.
- Padding inflates effective bbox.
- Scale floor at 1.

Tool surface (with stub runtime):

- ok payload with correct bbox, padding, entity_type, i, name.
- accepts entity_type case-insensitively (STATE, Province, Biome, etc.).
- accepts entity by numeric id and by name.
- accepts `padding === 0`.
- default padding is 50 when omitted.
- calls `zoomTo` with the expected `cx`, `cy`, scale, duration from the runtime bbox + viewport.
- single-cell bbox (width=height=0) → uses `FOCUS_ZOOM_LEVEL`.
- rejects unknown entity_type (including `burg`).
- rejects missing / negative / fractional / empty entity (non-biome).
- biome accepts id 0 but rejects negatives / fractions / empty.
- rejects non-numeric / out-of-range / fractional padding.
- surfaces `not-ready` as structured error.
- surfaces `unknown-entity` as structured error.
- surfaces entity with `cells_count: 0` as structured error (no bbox to fit).
- surfaces runtime `zoomTo` throw as structured error.
- exported as `focusOnEntityTool` with the expected schema.

Integration (`defaultFocusOnEntityRuntime`):

- stubs `globalThis.pack` / `globalThis.biomesData` / `globalThis.zoomTo` / `globalThis.svgWidth` / `globalThis.svgHeight` and verifies the tool reads them correctly end-to-end.
- surfaces missing `zoomTo` as an error.
- restores globals in `afterEach`.
