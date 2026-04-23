# Plan 171 — `set_layer_stroke_color` tool

## Use case

Add a new AI tool `set_layer_stroke_color` that sets the SVG `stroke`
attribute on a named map layer. Parallel to the existing
`set_layer_stroke_width` and `set_layer_opacity` tools (both already
present in `src/ai/tools/`). The Style Editor exposes per-layer stroke
color via `styleStrokeInput` in `public/modules/ui/style.js`:

```js
styleStrokeInput.on("input", function () {
  styleStrokeOutput.value = this.value;
  getEl().attr("stroke", this.value);
  if (styleElementSelect.value === "gridOverlay" && layerIsOn("toggleGrid")) drawGrid();
});
```

The new tool emulates that DOM side-effect without the UI — it accepts a
layer name (same aliases as `set_layer_opacity` / `set_layer_visibility`)
and a CSS color, and writes the `stroke` attribute on the layer's `<g>`
element (e.g. `#rivers`, `#borders`, `#regions`, `#terrs`).

## API

- `layer: string` — canonical layer name or alias (matches the
  `LAYER_SPECS` table from `set-layer-visibility`). Case-insensitive.
- `stroke: string` — required. A valid CSS color string (`#rgb`, `#rrggbb`,
  `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`,
  `lch()`, `color()`, or a named color). Validated via
  `isValidCssColor` exported from `./set-state-color`.
- Returns `{ ok: true, layer, previousStroke, stroke }` on success.
  `previousStroke` is the previous `stroke` attribute value (raw string)
  or `null` when absent.

## Design decisions

- **Runtime-seam pattern**: identical to `set-layer-stroke-width` —
  define a `LayerStrokeColorRuntime` interface with `readStroke(svgId)` +
  `setStroke(svgId, stroke)`; the default implementation reads/writes the
  DOM attribute. The factory takes the runtime so tests inject a mock.
- **Layer alias table**: duplicate the `CANONICAL_TO_SVG_ID` map locally
  (matches `set-layer-stroke-width`'s reasoning about keeping each tool
  self-contained and avoiding cross-tool coupling).
- **Validation**: reuse `isValidCssColor` from `./set-state-color` rather
  than redefining — this is the same validator the color-family tools
  (`set-biome-color`, `set-zone-color`, etc.) already use.
- **Previous value**: store raw attribute string verbatim (same as
  `set_layer_filter`) rather than parsing/canonicalizing — consumers of
  `previousStroke` typically want the exact prior value to restore.

## Files

- `src/ai/tools/set-layer-stroke-color.ts` — new tool.
- `src/ai/tools/set-layer-stroke-color.test.ts` — unit tests + default
  runtime integration block.
- `src/ai/index.ts` — import, register, re-export.
- `README_AI.md` — add a row near `set_layer_stroke_width`.

## Risks / edge cases

- `previousStroke = null` when `<g>` has no `stroke` attribute.
- Unknown layer → structured error with the supported list.
- Bad color → error with CSS-color guidance.
- Missing `<g>` → surfaced as `errorResult` from a throw in
  `setStroke`.
- `typeof document === "undefined"` → `setStroke` throws; tool surfaces.
