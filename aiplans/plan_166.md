# Plan 166 — `set_layer_stroke_width` AI tool

## Goal
Expose the Style Editor's per-layer stroke-width slider as a Claude tool.
Parallel to the just-merged `set_layer_opacity`. Distinct from
`set_layer_visibility` (binary hide/show), `apply_layers_preset` (bulk
on/off), and `set_layer_opacity` (alpha): this sets the `stroke-width` SVG
attribute on a specific `<g>` layer, mirroring the UI's
`styleStrokeWidthInput` slider in `public/modules/ui/style.js`.

## Upstream reference
- `public/modules/ui/style.js:455-458` — stroke-width handler:
  ```js
  styleStrokeWidthInput.on("input", e => {
    getEl().attr("stroke-width", e.target.value);
    if (styleElementSelect.value === "gridOverlay" && layerIsOn("toggleGrid")) drawGrid();
  });
  ```
  `getEl()` resolves to `svg.select("#" + id)` where `id` is the currently-
  selected Style Editor element. SVG `stroke-width` applies to any `<g>`:
  descendants inherit it unless they set their own (per SVG spec), so
  writing the attribute on the top-level layer group works for both direct-
  stroke layers (borders, rivers) and containers that pass it through.
- `src/index.html:1249-1256` — `<slider-input id="styleStrokeWidthInput"
  min="0" max="10" step=".01">`. **Range is 0..10** (floats); we match.
- `public/main.js` SVG layer groups and the same canonical → SVG-id map
  established by `set-layer-opacity.ts`.
- `set-layer-opacity.ts` already exports no SVG-id mapping helper; we
  replicate the `CANONICAL_TO_SVG_ID` table here because the opacity file's
  table is module-private and re-exporting it would risk a drift /
  duplicate-constant concern. The alias lookup is rebuilt from the already-
  exported `LAYER_SPECS`.

## Signature
`document.getElementById(layerId).setAttribute("stroke-width", value)`.
Accepts floats in `[0, 10]`.

## Tool contract
- Name: `set_layer_stroke_width`.
- Required:
  - `layer` (string) — layer name or alias (reuses the `LayerSpec` aliases
    from `set-layer-visibility.ts`: `rivers`, `biomes`, `markers`,
    `state borders`, `heightmap`, `burgs`, `burg icons`, etc.).
  - `width` (number) — finite, in `[0, 10]`. Matches the UI slider's
    `min="0" max="10" step=".01"`.
- Execute:
  - Resolve `layer` → canonical + `svgId` via the same mapping used by
    `set_layer_opacity`.
  - Read previous stroke-width from the element
    (`getAttribute("stroke-width")`); if absent/unparseable → `null`.
  - Write new stroke-width via `setAttribute("stroke-width",
    String(width))`.
  - Return `{ok, layer: canonical, previousWidth, width}`.

## Canonical-layer → SVG-id map
Identical to `set_layer_opacity` (same canonical set / same SVG group ids).
Replicated locally in the new tool file to avoid cross-tool coupling.

## Runtime seam
```ts
export interface LayerStrokeWidthRuntime {
  readStrokeWidth(svgId: string): number | null; // null when element
                                                  // missing or attr
                                                  // absent / unparseable
  setStrokeWidth(svgId: string, width: number): void; // throws if missing
}
```

`defaultLayerStrokeWidthRuntime` uses `document.getElementById(svgId)`:
- `readStrokeWidth`: if element missing → `null`; parse
  `getAttribute("stroke-width")` — absent / empty / unparseable → `null`
  (we return `null` rather than the opacity default of `1` because 0 is a
  perfectly valid stroke-width and there is no well-defined default
  across layers).
- `setStrokeWidth`: if element missing → `throw new Error("Layer element
  #<id> not found in DOM.")`; else
  `setAttribute("stroke-width", String(width))`.

## Input validation
- `layer`: required; must be a non-empty string. Resolve via alias table
  built from `LAYER_SPECS` (imported from `set-layer-visibility`).
- `width`: required finite number in `[0, 10]`; reject non-numbers,
  non-finite, negative, > 10.

## Registration
Register `setLayerStrokeWidthTool` in `buildDefaultRegistry()` immediately
after `setLayerOpacityTool`.

## Docs
Add a `README_AI.md` row right below the `set_layer_opacity` row, mirroring
its phrasing. Include the API-key reminder and 2–3 usage examples covering
different layers + widths.

## Tests
Mirror `set-layer-opacity.test.ts`:
- Tool tests with a fake runtime (`readStrokeWidth` + `setStrokeWidth` vi
  mocks):
  - happy path: set width 2 on rivers; assert runtime read called with
    `rivers`, set called with `(rivers, 2)`; result `{ok: true, layer:
    "rivers", previousWidth: <read>, width: 2}`.
  - alias: `"state borders"` → canonical `borders` / svgId `borders`.
  - case-insensitive (`"RIVERS"`).
  - `heightmap` maps to svgId `terrs`; `burgs` → `burgIcons`; `cultures`
    → `cults`; `religions` → `relig`.
  - boundary values `0` and `10` accepted.
  - unknown layer → `isError: true`; body includes `supported` list.
  - missing / empty / whitespace `layer` → error.
  - non-number / non-finite / out-of-range (`-0.1`, `10.1`, `"2"`) → error.
  - `setStrokeWidth` throws → surfaced as errorResult.
  - `readStrokeWidth` returning `null` → `previousWidth: null` in result.
  - Tool name + schema assertion (name, required fields list).
- `defaultLayerStrokeWidthRuntime` integration block using
  `globalThis as unknown as { document?: unknown }` stubbing
  `getElementById` to return a minimal fake element with
  `getAttribute` / `setAttribute`:
  - happy path: writes the `stroke-width` attribute; previousWidth is the
    parsed prior value.
  - `previousWidth` is `null` when the attribute is absent.
  - `previousWidth` is `null` when the attribute is unparseable.
  - missing element → `isError: true`, message contains "not found".
  - document undefined → `isError: true`, message mentions "document".
  - alias `"state borders"` writes to `#borders`.

## Verification gates
- `npm run build` succeeds.
- `npm test` — expect roughly +16 tests (new file only).
- `npm run lint` matches `7 warnings / 1 info / 0 errors` baseline.

## Commit
`feat(ai): add set_layer_stroke_width tool` + 1–2 line body. Stage only
the new / modified files.
