# Tasks — Plan 164 (`set_layer_opacity`)

1. [x] Baseline — read `set-layer-visibility.ts` + test, `apply-layers-preset.ts`
       + test, `public/modules/ui/style.js` (opacity handler + getEl),
       `src/index.html` (styleElementSelect options + styleOpacityInput),
       `public/main.js` (SVG layer `<g>` ids), `src/ai/index.ts`,
       `_shared/index.ts`, `README_AI.md`. Confirmed:
       - UI slider range is 0..1 (`min="0" max="1" step="0.01"`).
       - Canonical layer → SVG id map (see plan).
       - Baselines: 7 warnings / 1 info / 0 errors; 2205 tests / 176 files.

2. [ ] Edit `src/ai/tools/set-layer-visibility.ts`: promote the internal
       `LAYERS` array to a named export `LAYER_SPECS` (no new constant, just
       export the existing one). Leave everything else unchanged.

3. [ ] Create `src/ai/tools/set-layer-opacity.ts`:
   - Import `LAYER_SPECS` + `LayerSpec` type from
     `./set-layer-visibility`.
   - Module-internal `CANONICAL_TO_SVG_ID: Record<canonical, string>` and
     `LOOKUP: Map<alias, { canonical, svgId }>`.
   - `LayerOpacityRuntime` interface with `readOpacity(svgId)` and
     `setOpacity(svgId, opacity)`.
   - `defaultLayerOpacityRuntime` using `document.getElementById` — throws
     when element is missing on write; returns `null` on read when missing;
     parses `getAttribute("opacity")` and defaults to `1` if absent /
     unparseable.
   - `createSetLayerOpacityTool(runtime?)` factory and
     `setLayerOpacityTool` default instance.
   - Input validation:
     - `layer`: non-empty string; case-insensitive; must resolve via alias
       map; else error with `supported` canonical list.
     - `opacity`: finite number in `[0, 1]` (inclusive).
   - Return `{ok, layer: canonical, previousOpacity, opacity}`.

4. [ ] Create `src/ai/tools/set-layer-opacity.test.ts`:
   - Tool tests with fake runtime mirroring the plan's test matrix.
   - `defaultLayerOpacityRuntime` integration block using
     `globalThis as unknown as { document?: unknown }` stubbing
     `getElementById` to return a minimal `{ getAttribute, setAttribute }`
     object.

5. [ ] Register `setLayerOpacityTool` in `src/ai/index.ts`:
   - Import after `setLayerVisibilityTool`.
   - Register in `buildDefaultRegistry()` right after
     `applyLayersPresetTool`.
   - Re-export `{ setLayerOpacityTool, createSetLayerOpacityTool }`.

6. [ ] Add a README_AI.md row immediately below `apply_layers_preset` with
       API-key reminder and 2–3 example prompts covering different layers +
       opacity values.

7. [ ] Verify: `npm run build`, `npm test` (expect +~14–16 tests),
       `npm run lint` matches the 7/1/0 baseline.

8. [ ] Commit with `feat(ai): add set_layer_opacity tool`, staging only
       the new / modified files.
