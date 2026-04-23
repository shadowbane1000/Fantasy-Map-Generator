# Tasks — Plan 166 (`set_layer_stroke_width`)

1. [x] Baseline — read `set-layer-opacity.ts` + test, `set-layer-visibility.ts`,
       `public/modules/ui/style.js` (stroke-width handler + getEl),
       `src/index.html` (styleStrokeWidthInput), `src/ai/index.ts`,
       `_shared/index.ts`, `README_AI.md`. Confirmed:
       - UI slider range is 0..10 (`min="0" max="10" step=".01"`).
       - `LAYER_SPECS` already exported from `set-layer-visibility.ts`.
       - Canonical → SVG id map (same set as `set_layer_opacity`).
       - Baselines: 7 warnings / 1 info / 0 errors; 2238 tests / 178 files.

2. [ ] Create `src/ai/tools/set-layer-stroke-width.ts`:
   - Import `LAYER_SPECS` + `LayerSpec` type from
     `./set-layer-visibility`.
   - Module-internal `CANONICAL_TO_SVG_ID: Record<canonical, string>` and
     `LOOKUP: Map<alias, { canonical, svgId }>` (copy of the opacity
     tool's map; intentionally duplicated to avoid cross-tool coupling).
   - `LayerStrokeWidthRuntime` interface with `readStrokeWidth(svgId)` and
     `setStrokeWidth(svgId, width)`.
   - `defaultLayerStrokeWidthRuntime` using `document.getElementById` —
     throws when element is missing on write; returns `null` on read
     when element is missing or attribute absent / unparseable.
   - `WIDTH_MIN = 0`, `WIDTH_MAX = 10` exported constants.
   - `createSetLayerStrokeWidthTool(runtime?)` factory +
     `setLayerStrokeWidthTool` default instance.
   - Input validation:
     - `layer`: non-empty string; case-insensitive; must resolve via alias
       map; else error with `supported` canonical list.
     - `width`: finite number in `[0, 10]` (inclusive).
   - Return `{ok, layer: canonical, previousWidth, width}`.

3. [ ] Create `src/ai/tools/set-layer-stroke-width.test.ts`:
   - Tool tests with fake runtime (happy path, aliases, case-insensitive,
     boundaries 0 & 10, unknown layer, missing/empty layer, invalid
     widths, setter throws, read returns null, schema/name).
   - `defaultLayerStrokeWidthRuntime` integration block using
     `globalThis as unknown as { document?: unknown }` stubbing
     `getElementById` to return a minimal `{ getAttribute, setAttribute }`
     fake element.

4. [ ] Register `setLayerStrokeWidthTool` in `src/ai/index.ts`:
   - Import after `setLayerOpacityTool`.
   - Register in `buildDefaultRegistry()` right after
     `setLayerOpacityTool`.
   - Re-export `{ setLayerStrokeWidthTool, createSetLayerStrokeWidthTool,
     defaultLayerStrokeWidthRuntime, LayerStrokeWidthRuntime, WIDTH_MIN,
     WIDTH_MAX }`.

5. [ ] Add a README_AI.md row immediately below `set_layer_opacity` with
       API-key reminder and 2–3 example prompts covering different layers
       + widths.

6. [ ] Verify: `npm run build`, `npm test` (expect roughly +16 tests),
       `npm run lint` matches the 7/1/0 baseline.

7. [ ] Commit with `feat(ai): add set_layer_stroke_width tool`, staging
       only the new / modified files.
