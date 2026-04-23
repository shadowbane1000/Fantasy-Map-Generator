# Plan 206 — `get_layer_style` AI tool

## Goal

Add a read-only AI tool `get_layer_style` that reads back the current style
attributes of a named SVG map layer — opacity, fill, stroke color, stroke
width, stroke-dasharray, filter. This complements the existing `set_layer_*`
tools (`set_layer_opacity`, `set_layer_fill`, `set_layer_stroke_color`,
`set_layer_stroke_width`, `set_layer_stroke_dasharray`, `set_layer_filter`)
which each write one of those attributes.

## Motivation

Agents can already mutate layer style via the six `set_layer_*` tools but
have no way to read the current values before deciding what to change.
Each `set_*` tool already returns a `previous*` field, but that only covers
one attribute at a time and requires the agent to write first. A dedicated
read tool keeps the read path cheap and side-effect-free.

## API

Input: one required string `layer`. The same alias set as
`set_layer_opacity` and friends — driven by `LAYER_SPECS` from
`set-layer-visibility` and mapped to SVG ids via the same
`CANONICAL_TO_SVG_ID` table every set-tool inlines locally (we inline it
here too rather than re-exporting to keep each tool self-contained — the
convention set by the other layer-style tools).

Output on success:

```json
{
  "ok": true,
  "layer": "rivers",
  "opacity": 0.8,
  "fill": "#336699",
  "stroke": "#000000",
  "strokeWidth": 1.2,
  "strokeDasharray": "5,5",
  "filter": "url(#dropShadow)"
}
```

- `layer` is the canonical layer name (e.g. `"rivers"`, `"borders"`).
- `opacity` — `number | null`. Parses the `opacity` attribute; `null` when
  the attribute is absent or unparseable (matches how the other read-side
  tools treat missing attrs; `set_layer_opacity`'s `readOpacity` returns
  `null` only when the element doesn't exist, but for `get_layer_style`
  we conservatively expose `null` any time the parse fails).
- `strokeWidth` — `number | null`. Same parsing rule as
  `set_layer_stroke_width`'s `readStrokeWidth`.
- `fill`, `stroke`, `strokeDasharray`, `filter` — `string | null`.
  Raw attribute values (trimmed empty strings become `null`).

Errors:

- Unknown layer → structured error with `supported` list (same shape as
  the set-tools).
- Missing / empty `layer` → structured error.
- Layer element not present in DOM → structured error (the read
  runtime throws; we surface it).

## Runtime seam

```ts
export interface LayerStyleRuntime {
  read(svgId: string): LayerStyleAttrs | null;
}

interface LayerStyleAttrs {
  opacity: number | null;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  strokeDasharray: string | null;
  filter: string | null;
}
```

`defaultLayerStyleRuntime.read()` looks up the element by id. Returns
`null` when the element doesn't exist; the tool surface turns that into an
error so the agent knows the layer is absent.

Tests use `createGetLayerStyleTool(customRuntime)` to inject a fake; an
integration describe block at the bottom stubs `globalThis.document` with
a fake `getElementById` through `as unknown as { document?: unknown }`.

## Registration

- `src/ai/tools/get-layer-style.ts` — runtime-seam tool.
- `src/ai/tools/get-layer-style.test.ts` — unit + integration describe.
- `src/ai/index.ts` — import, re-export create-fn / default runtime /
  types, register in `buildDefaultRegistry` near `setLayerOpacityTool`.
- `README_AI.md` — add a row near `set_layer_opacity` / `set_layer_filter`.

## Tests

Tool surface (create with injected runtime):

- reads opacity / fill / stroke / strokeWidth / strokeDasharray / filter
  for a fully styled layer
- resolves aliases (e.g. `state borders` → canonical `borders`)
- resolves canonical → SVG id for the divergent cases (heightmap→terrs,
  burgs→burgIcons, states→regions, cultures→cults, religions→relig)
- case-insensitive layer names
- returns `null` entries when the layer carries no attributes
- unknown layer → structured error with `supported`
- missing / empty `layer` → structured error
- missing element (runtime returns `null`) → structured error
- tool schema: name = `get_layer_style`, `required = ["layer"]`

Integration (`defaultLayerStyleRuntime`):

- stubs `globalThis.document.getElementById` with fake elements
- reads an element that has every attribute set (opacity, fill, stroke,
  stroke-width, stroke-dasharray, filter) and returns the expected shape
- reads an element that has no attributes → all fields `null`
- non-existent element → error
- `opacity` and `stroke-width` parse numeric strings; unparseable strings
  yield `null` (not NaN)

## Non-goals

- Writing any attribute — this tool is read-only.
- Returning other SVG attributes (e.g. `display`, `visibility`,
  `font-family`) — covered by `set_layer_visibility` and the font tools;
  keep the payload scoped to the six attrs managed by the `set_layer_*`
  style family.
- Returning computed styles (e.g. inherited values from CSS). We read raw
  attributes on the layer's `<g>` only, matching what the set-tools
  write.
