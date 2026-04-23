# Plan 164 — `set_layer_opacity` AI tool

## Goal
Expose the Style Editor's per-layer opacity slider as a Claude tool. Distinct
from `set_layer_visibility` (binary hide/show) and `apply_layers_preset` (bulk
on/off): this sets the `opacity` SVG attribute on a specific `<g>` layer,
mirroring the UI's `styleOpacityInput` slider in `public/modules/ui/style.js`.

## Upstream reference
- `public/modules/ui/style.js:474-476` — opacity handler:
  ```js
  styleOpacityInput.on("input", e => {
    getEl().attr("opacity", e.target.value);
  });
  ```
  `getEl()` (line 437) resolves to `svg.select("#" + id)` where `id` is the
  currently-selected Style Editor element (the HTML `<option value="...">`).
- `src/index.html:775-815` — the `<select id="styleElementSelect">` options
  list. The `value` of each option is the DOM id of the SVG `<g>` layer
  (e.g. `biomes`, `rivers`, `markers`, `burgIcons`, `terrs` for heightmap,
  `regions` for states, `relig` for religions, `cults` for cultures, etc.).
- `src/index.html:892` — `<slider-input id="styleOpacityInput" min="0"
  max="1" step="0.01">`. **Range is 0..1** (floats); we match.
- `public/main.js:39-79` — SVG layer groups are appended with the same ids
  that appear in the select (plus `statesBody` / `statesHalo` inside
  `regions`, `stateBorders` / `provinceBorders` inside `borders`, etc.). We
  only address the top-level groups (matching the `set_layer_visibility`
  canonical set); sub-groups are out of scope.
- `public/modules/ui/style.js:98-101` — UI shows the opacity slider for all
  layers except `landmass`, `ocean`, `regions`, `legend`. We still allow
  setting opacity on any of the canonical `set_layer_visibility` layers —
  the attribute always applies (d3 `.attr("opacity", v)` writes the SVG
  `opacity` attr regardless of which `<g>` it is); the UI just hides the
  slider for those four because they have nested opacity controls. The tool
  mirrors the slider semantics: **sets `<g id="...">` opacity**.

## Signature
`document.getElementById(layerId).setAttribute("opacity", value)` (or via
d3 `.attr`). Accepts floats in `[0, 1]`.

## Tool contract
- Name: `set_layer_opacity`.
- Required:
  - `layer` (string) — layer name or alias (reuses the `LayerSpec` aliases
    from `set-layer-visibility.ts`: `rivers`, `biomes`, `markers`,
    `state borders`, `heightmap`, `burgs`, `burg icons`, etc.).
  - `opacity` (number) — finite, in `[0, 1]`. 1 = fully opaque, 0 = fully
    transparent. Matches the UI slider's `min="0" max="1" step="0.01"`.
- Execute:
  - Resolve `layer` → `LayerSpec.buttonId` (this is the DOM id of the `<g>`;
    for every canonical layer in `set-layer-visibility.ts`, the `buttonId`
    equals the `toggleFn` minus the "toggle" prefix, camel-cased — but
    crucially for opacity we want the **SVG `<g>` id**, not the button id).
  - **Important**: some `LayerSpec.buttonId`s do NOT equal the SVG id. For
    example `buttonId: "toggleRivers"` but the SVG group is `id="rivers"`.
    We need an explicit `svgId` mapping per layer spec. Solution: extend
    the LayerSpec shape locally in this tool (or add an `svgId` field to
    the exported `LayerSpec`). **Chosen approach**: define a parallel
    local map `LAYER_SVG_IDS: Record<canonical, string>` in
    `set-layer-opacity.ts` that maps the canonical layer name (from
    `set-layer-visibility.ts`) to the SVG element id. This avoids touching
    the visibility tool's exported shape and keeps concerns separated.
- Read previous opacity from the element (`getAttribute("opacity")` or
  default `"1"` if absent / null). Parse to number (fallback 1).
- Write new opacity via `setAttribute("opacity", String(opacity))`.
- Return `{ok, layer: canonical, previousOpacity, opacity}`.

## Canonical-layer → SVG-id map
Based on `set-layer-visibility.ts` aliases and `public/main.js` / `index.html`
group definitions:

| canonical          | SVG `<g>` id           |
| ------------------ | ---------------------- |
| heightmap          | `terrs`                |
| temperature        | `temperature`          |
| biomes             | `biomes`               |
| precipitation      | `prec`                 |
| population         | `population`           |
| cells              | `cells`                |
| ice                | `ice`                  |
| cultures           | `cults`                |
| religions          | `relig`                |
| states             | `regions`              |
| borders            | `borders`              |
| provinces          | `provs`                |
| grid               | `gridOverlay`          |
| coordinates        | `coordinates`          |
| compass            | `compass`              |
| relief             | `terrain`              |
| texture            | `texture`              |
| rivers             | `rivers`               |
| routes             | `routes`               |
| military           | `armies`               |
| markers            | `markers`              |
| labels             | `labels`               |
| burgs              | `burgIcons`            |
| rulers             | `ruler`                |
| scale bar          | `scaleBar`             |
| zones              | `zones`                |
| emblems            | `emblems`              |
| vignette           | `vignette`             |

## Runtime seam
```ts
export interface LayerOpacityRuntime {
  readOpacity(svgId: string): number | null; // null when element missing
  setOpacity(svgId: string, opacity: number): void; // throws if element missing
}
```

`defaultLayerOpacityRuntime` uses `document.getElementById(svgId)`:
- `readOpacity`: if element missing → `null`; else parse `getAttribute("opacity")`
  — falsy / unparseable → default `1`.
- `setOpacity`: if element missing → `throw new Error("Layer element #<id>
  not found in DOM.")`; else `setAttribute("opacity", String(opacity))`.

## Input validation
- `layer`: required; must be a non-empty string. Resolve via the same alias
  table as `set_layer_visibility` (re-use `LAYERS` / lookup by importing the
  exported `LayerSpec` type + an internal lookup we build from the re-used
  canonical list). Implementation choice: **re-import the `LAYERS` array
  from `set-layer-visibility.ts`** (it's already exported as a typed const
  via the `LayerSpec` type export — we add a value export for `LAYERS` if
  needed; otherwise we inline a local copy of just the alias→canonical map
  since the `svgId` mapping is distinct anyway). To avoid duplicate-export
  constants (per the task rules), the cleanest approach is: **add a new
  non-duplicating helper `getLayerSpec(name)` to set-layer-visibility.ts**
  and re-use it. Alternative: inline a minimal `LAYER_ALIASES` table in
  set-layer-opacity.ts that mirrors the visibility aliases.
  - **Chosen approach**: inline a local `LOOKUP` map built from the same
    canonical list + aliases, but construct it from an imported
    `LAYER_SPECS` array. Simplest: export the existing `LAYERS` array
    (currently module-private) from `set-layer-visibility.ts` as
    `LAYER_SPECS` (type `readonly LayerSpec[]`), and reuse it here.
    This is a value export (not a duplicate), so it satisfies the "do not
    duplicate-export shared constants" rule — we're consuming, not
    re-declaring.
- `opacity`: required finite number in `[0, 1]`; reject non-numbers,
  non-finite, <0, >1.

## Registration
Register `setLayerOpacityTool` in `buildDefaultRegistry()` immediately after
`applyLayersPresetTool` (already adjacent to `setLayerVisibilityTool`).

## Docs
Add a README_AI.md row right below the `apply_layers_preset` row, matching
the style-editor tools' wording. Include the API-key reminder and 2–3
usage examples covering different layers + opacity values.

## Tests
Mirror `set-layer-visibility.test.ts`:
- Tool tests with a fake runtime (`readOpacity` + `setOpacity` vi mocks):
  - happy path: set opacity 0.5 on rivers; assert readOpacity called with
    `rivers`, setOpacity called with `(rivers, 0.5)`; result
    `{ok: true, layer: "rivers", previousOpacity: <read>, opacity: 0.5}`.
  - alias: `"state borders"` → canonical `borders` / svgId `borders`.
  - case-insensitive (`"RIVERS"`).
  - boundary values `0` and `1` accepted.
  - unknown layer → `isError: true`; body includes `supported` list.
  - missing / empty / whitespace `layer` → error.
  - non-number / non-finite / out-of-range (`-0.1`, `1.1`, `"0.5"`) → error.
  - `setOpacity` throws → surfaced as errorResult.
  - `readOpacity` returning `null` → `previousOpacity: null` in result.
- `defaultLayerOpacityRuntime` integration block using
  `globalThis as unknown as { document?: unknown }`:
  - happy path: set opacity on a mock element; element's `opacity`
    attribute becomes the new value; previousOpacity read from prior
    `getAttribute`.
  - `readOpacity` returns `null` when element missing.
  - `setOpacity` throws when element missing.
  - `readOpacity` defaults to `1` when attribute absent / unparseable.
- Tool name + schema assertion (name, required fields list).

## Verification gates
- `npm run build` succeeds.
- `npm test` — expect +~14–16 tests (new file only).
- `npm run lint` matches `7 warnings / 1 info / 0 errors` baseline.

## Commit
`feat(ai): add set_layer_opacity tool` + 1–2 line body. Stage only the new /
modified files.
