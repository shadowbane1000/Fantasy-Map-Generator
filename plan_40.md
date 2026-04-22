# Plan 40 — Use Case: Export the map to an image or GeoJSON file

## Status

Iteration 40. 38 AI tools. Baseline 7 warnings / 1 info / 0 errors.
473 tests pass.

## Use Case

**"Export the current map to a file: SVG, PNG, JPEG, or a
GeoJSON slice."**

The Export menu (behind the File button) exposes:

- `exportToSvg()` — full-fidelity SVG
  (`public/modules/io/export.js:4-15`)
- `exportToPng()` — rasterized PNG at
  `pngResolutionInput.value` scale (`:17-46`)
- `exportToJpeg()` — rasterized JPEG (`:48-71`)
- `saveGeoJsonCells()` — cell polygons (`:489`)
- `saveGeoJsonRoutes()` — route lines (`:529`)
- `saveGeoJsonRivers()` — river polylines (`:544`)
- `saveGeoJsonMarkers()` — marker points (`:563`)
- `saveGeoJsonZones()` — zones polygons (`:578`)

Each is a globally-declared (classic script) top-level function on
window. They all trigger a browser download and return void/async.

This is a polymorphic tool — same shape as
`set_entity_lock` and `set_entity_expansionism`.

Prompts:
- *"Export the map as SVG."*
- *"Save it as a PNG."*
- *"Export the rivers as GeoJSON."*

### Success criteria

1. `export_map({format: "svg"})` calls `window.exportToSvg()`.
2. `export_map({format: "png"})` → `window.exportToPng()`.
3. `export_map({format: "jpeg"})` → `window.exportToJpeg()`.
4. `export_map({format: "geojson-cells"})` →
   `window.saveGeoJsonCells()`; same for routes/rivers/markers/zones.
5. Friendly aliases: `"jpg"` → jpeg; `"image/svg"` / `"svg+xml"` →
   svg; `"cells"` → geojson-cells; `"markers"` → geojson-markers,
   etc.
6. Unknown format → structured error with `supported` list.
7. Missing global (pre-load) → structured error.
8. Export throws → structured error.
9. Awaits async exports before returning.

## Scope

In-scope:
- `export_map` tool with `MapExportRuntime` seam.
- Registry + README + tests.

Out-of-scope:
- Setting `pngResolutionInput` scale (future: could tweak rescale
  options).
- Batch exports (caller can invoke the tool multiple times).

## Design

New file: `src/ai/tools/export-map.ts`.

```ts
export type ExportFormat =
  | "svg" | "png" | "jpeg"
  | "geojson-cells" | "geojson-routes" | "geojson-rivers"
  | "geojson-markers" | "geojson-zones";
export const EXPORT_FORMATS: ExportFormat[] = [...];
export interface MapExportRuntime {
  export(format: ExportFormat): Promise<void> | void;
}
```

Pure `resolveExportFormat(s)` — alias map canonicalizes
common variants. Default runtime dispatches to the matching global
function.

Executor:
1. Resolve format.
2. Call `runtime.export(format)` (await).
3. Return ok result with `{format}`.

## Files

Create: `plan_40.md`, `tasks_40.md`,
`src/ai/tools/export-map.ts`,
`src/ai/tools/export-map.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`export-map.test.ts`):

1. Each of the 8 canonical formats → runtime called with the
   matching format.
2. Aliases resolve correctly (`jpg` → jpeg, `cells` →
   geojson-cells, etc.).
3. Case-insensitive / whitespace-tolerant.
4. Unknown format → error + supported list.
5. Runtime async rejection → error.
6. Runtime sync throw → error.
7. Missing format → error.
8. Non-string format → error.

Plus a default-runtime dispatch test with mocked globals covering
at least SVG + one GeoJSON variant.

## Plan ↔ tasks ↔ tests verification

Each criterion has a test.

Lint / test / build gates in tasks_40.md.
