# Tasks 40 — Execution checklist for Plan 40

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 473 tests.

## Implementation

- [ ] T2. `src/ai/tools/export-map.ts`
      - `ExportFormat` + `EXPORT_FORMATS`.
      - Pure `resolveExportFormat(s)` alias map (jpg → jpeg,
        cells → geojson-cells, image/svg → svg, etc.).
      - `MapExportRuntime` with `export(format)` (awaitable).
      - `defaultMapExportRuntime` dispatches to
        `window.exportToSvg` / `exportToPng` / `exportToJpeg` /
        `saveGeoJsonCells` etc.
      - `createExportMapTool(runtime?)` + `exportMapTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/export-map.test.ts` — ≥10 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
