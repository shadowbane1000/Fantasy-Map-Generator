# Plan 176 — `set_cell_height` AI tool

## Goal
Expose a granular AI tool that sets the height of a **single** grid cell. Parallels the Heightmap Editor's paint/brush flow which writes to `grid.cells.h[cellId]` one cell at a time (see `public/modules/ui/heightmap-editor.js` `changeHeightForSelection`, lines ~715-750, and the image converter path at line 1429 — `grid.cells.h[i] = height`). Unlike `clear_heightmap` (bulk reset) and `smooth_heightmap` (HeightmapGenerator round-trip), this tool is a direct scalar mutation — no generator, no redraw.

## Shape
- Tool name: `set_cell_height`.
- Required inputs:
  - `cell` (number): grid cell index, `0 ≤ cell < grid.cells.i.length`.
  - `height` (number): target height, integer in `[0, 100]`.
- Validation:
  - `cell`: finite integer, non-negative, strictly less than `grid.cells.i.length`.
  - `height`: finite integer in `[0, 100]` (the `grid.cells.h` array is a `Uint8Array` — anything outside this range is meaningless).
- Runtime-seam pattern (`SetCellHeightRuntime`) with `set(cell, height)` returning `{ previousHeight }`.
- `defaultSetCellHeightRuntime` reads `window.grid` via `getGlobal`, validates `grid.cells.h` exists and the index is within bounds (secondary defence), writes in place, and returns the previous value.
- Return body on success: `{ ok: true, cell, previousHeight, height }`.
- Return body on error: standard `errorResult` with descriptive messages.
- Does NOT auto-regenerate downstream domains — biomes/rivers/states/etc. still reflect pre-edit heights until the caller invokes `regenerate_map` (or a relevant `regenerate_domain`).

## Registration / exports
- Import into `src/ai/index.ts`, add both the named barrel export (`setCellHeightTool`, `createSetCellHeightTool` — **no `DEFAULT_*` re-exports**), and `registry.register(setCellHeightTool)` in `buildDefaultRegistry()` near the other heightmap tools (next to `clearHeightmapTool`).

## Tests
- Unit tests that feed a mocked runtime to exercise: happy-path call, missing cell, missing height, non-numeric / non-integer / out-of-range values (both params), runtime errors bubbling up, tool shape (name, required keys `["cell","height"]`).
- Integration block (`defaultSetCellHeightRuntime`) that stubs `globalThis.grid` with a plain-object cells.h array and a typed `Uint8Array`, asserts in-place mutation, previous-value return, and error throwing when grid/h is missing or cell is out of bounds.

## README_AI.md
Add a row directly below the `clear_heightmap` row. Include the "Requires an Anthropic API key" disclaimer and 2-3 usage examples.

## Out of scope
- No bulk-cell API (use `clear_heightmap` or `modify_heightmap` for broad edits).
- No visual redraw; the UI won't refresh until the caller triggers one.
- No pack-graph mutation — only `grid.cells.h`, mirroring the image-converter editor path.
