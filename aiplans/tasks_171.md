# Tasks 171 — `set_layer_stroke_color`

- [ ] Create `src/ai/tools/set-layer-stroke-color.ts`
  - Local `CANONICAL_TO_SVG_ID` map (clone of `set-layer-stroke-width`).
  - `LayerStrokeColorRuntime` interface: `readStroke(id): string | null`,
    `setStroke(id, stroke): void`.
  - `defaultLayerStrokeColorRuntime` reads/writes the `stroke`
    attribute on `document.getElementById(svgId)`.
  - `createSetLayerStrokeColorTool(runtime)` → `Tool`:
    - Validate `layer` (non-empty string, case-insensitive lookup
      against the `LAYER_SPECS` aliases).
    - Validate `stroke` via `isValidCssColor` (imported from
      `./set-state-color`).
    - Return `{ok, layer, previousStroke, stroke}`.
  - Export `setLayerStrokeColorTool = createSetLayerStrokeColorTool()`.

- [ ] Create `src/ai/tools/set-layer-stroke-color.test.ts`
  - Base cases: sets rivers, state-borders alias, heightmap → #terrs,
    burgs → #burgIcons, cultures → #cults, religions → #relig.
  - Case-insensitive layer names.
  - Valid color formats: `#fff`, `#000000`, `rgba(…)`, `hsl(…)`, named.
  - Errors: unknown layer (with `supported` list), missing/empty layer,
    invalid color (non-string, empty, junk).
  - Runtime failure surfaced as `errorResult`.
  - `previousStroke: null` when runtime returns `null`.
  - Schema: `name = "set_layer_stroke_color"`,
    `required = ["layer", "stroke"]`.
  - `defaultLayerStrokeColorRuntime` integration block with fake
    `document`: writes the attribute, returns previous raw string,
    returns null when absent, errors when `<g>` missing and when
    `document` is `undefined`, and maps `"state borders"` to
    `#borders`.

- [ ] Register + re-export in `src/ai/index.ts`
  - Import `setLayerStrokeColorTool`.
  - Add `registry.register(setLayerStrokeColorTool)` after
    `setLayerStrokeWidthTool`.
  - Re-export the factory + default runtime + type.

- [ ] Update `README_AI.md`
  - Add a row immediately after `set_layer_stroke_width`.
  - Mention the Style Editor parallel (`styleStrokeInput`), layer
    aliases, supported color formats, return shape, and the standard
    API-key footer.

- [ ] Verify
  - `npm run build` passes (`tsc && vite build`).
  - `npm test` runs clean; new tests all pass.
  - `npx biome check src/` matches baseline (7 warnings, 1 info, 0
    errors).

- [ ] Commit with message `feat(ai): add set_layer_stroke_color tool`.
