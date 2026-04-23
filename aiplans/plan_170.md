# Plan 170 — `set_layer_fill` AI tool

## Goal

Add an AI tool `set_layer_fill` that sets the `fill` attribute on a named
SVG map layer — the same side-effect as the Style Editor's per-layer fill
color picker (`styleFillInput.on("input", …)` in `public/modules/ui/style.js`
lines 444-447). The tool writes `fill="<color>"` on the layer's `<g>`
element.

## Use case

- Input: `layer` (string, same aliases as `set_layer_opacity` /
  `set_layer_stroke_width`), `fill` (string, a valid CSS color — hex,
  `rgb()/rgba()`, `hsl()/hsla()`, or a named color).
- Output: `{ ok: true, layer, previousFill, fill }`.
  - `previousFill` is the raw attribute value as a string or `null` when
    absent.
  - `fill` is the applied (trimmed) color string.

## Layer resolution

Re-use the `CANONICAL_TO_SVG_ID` table and alias map pattern from
`set-layer-opacity.ts` / `set-layer-stroke-width.ts` (same user-facing
surface so "rivers" or "state borders" resolves identically). The
canonical names come from `LAYER_SPECS` in `set-layer-visibility.ts`.

## Architecture

Runtime-seam pattern (matches `set-layer-opacity.ts`,
`set-layer-stroke-width.ts`, `set-layer-filter.ts`):

```ts
export interface LayerFillRuntime {
  readFill(svgId: string): string | null;
  setFill(svgId: string, fill: string): void;
}
export const defaultLayerFillRuntime: LayerFillRuntime = { … };
export function createSetLayerFillTool(
  runtime: LayerFillRuntime = defaultLayerFillRuntime
): Tool { … }
export const setLayerFillTool = createSetLayerFillTool();
```

`setFill(svgId, color)` writes via `setAttribute("fill", color)` —
matches the Style Editor change-handler which writes `this.value`
directly.

## Color validation

Re-use `isValidCssColor` from `./set-state-color`. That validator
accepts: hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), functional
colors (`rgb()/rgba()/hsl()/hsla()/hwb()/lab()/lch()/color()`), and
named colors (3-30 alpha chars). Same validator as `set_biome_color` and
`set_state_color` for consistency.

## Validation

1. `layer` must be a non-empty string; must resolve via `LOOKUP` (else
   return `supported` list of canonical layer names).
2. `fill` must be a valid CSS color (trimmed).
3. Unknown layer → error with `supported` list.
4. Runtime `setFill` throws (e.g. element not found, `document`
   unavailable) → `errorResult`.

## Files

- `src/ai/tools/set-layer-fill.ts` — tool + runtime + exports.
- `src/ai/tools/set-layer-fill.test.ts` — unit tests + integration via
  `defaultLayerFillRuntime` with a fake `document`.
- `src/ai/index.ts` — import + re-export + `registry.register`.
- `README_AI.md` — new row adjacent to `set_layer_opacity` /
  `set_layer_stroke_width`.

## Tests

Unit (pure-runtime mock):

- sets `fill="#ff0000"` on `#rivers` when layer="rivers",
  fill="#ff0000".
- resolves canonical alias `state borders` → `#borders`.
- resolves `heightmap` → `#terrs`, `burgs` → `#burgIcons`,
  `cultures` → `#cults`, `religions` → `#relig`.
- accepts case-insensitive layer names.
- accepts rgb(), rgba(), hsl(), hsla(), and named colors (e.g. "red").
- trims surrounding whitespace from the color value.
- returns `previousFill` from runtime.
- errors on missing/empty/non-string `layer`.
- errors on missing/non-string/invalid CSS color `fill`.
- errors on unknown layer with `supported` list.
- surfaces `setFill` throw as `errorResult`.
- exposes `name === "set_layer_fill"` and
  `required: ["layer", "fill"]`.

Integration (`defaultLayerFillRuntime` w/ fake `document`):

- writes `fill` attr on the SVG element; reports previous value.
- reports `previousFill: null` when attribute absent.
- errors when element missing.
- errors when `document` unavailable.
- resolves `state borders` alias to `#borders`.

## Non-goals

- We do not replicate the Style Editor's per-layer branching (it sets
  `fill` on sub-elements such as `#oceanBase` for the ocean). The tool
  targets the layer group directly — the same coarse model used by
  `set_layer_opacity` / `set_layer_stroke_width` / `set_layer_filter`.
- We do not refresh any D3 selections or attributes on child elements.
