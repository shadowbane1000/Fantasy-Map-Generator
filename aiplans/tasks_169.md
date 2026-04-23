# Tasks 169 — `set_layer_filter` AI tool

- [x] Study `public/modules/ui/style.js` filter handler + `<g id="filters">`
      in `src/index.html`. Document all filter ids (see plan_169.md).
- [x] Study `set-layer-opacity.ts`, `set-layer-stroke-width.ts`,
      `set-font-family.ts` patterns (runtime seam, alias resolution, error
      shape).
- [ ] Write `src/ai/tools/set-layer-filter.ts`:
      - `FILTER_IDS` (readonly tuple) — canonical filter ids.
      - `FILTER_ALIASES` — alias map for friendly names.
      - `CANONICAL_TO_SVG_ID` mirroring the shared pattern (local copy, no
        cross-tool import).
      - `LayerFilterRuntime` interface.
      - `defaultLayerFilterRuntime` using `document.getElementById`.
      - `createSetLayerFilterTool(runtime)` + `setLayerFilterTool` default.
- [ ] Write `src/ai/tools/set-layer-filter.test.ts` with pure-mock unit tests
      plus a `describe("defaultLayerFilterRuntime (integration)")` block using
      `as unknown as { ... }` casts to stub `globalThis.document`.
- [ ] Register in `src/ai/index.ts`:
      - import.
      - export block after `setLayerStrokeWidthTool` exports.
      - `registry.register(setLayerFilterTool)` in the same cluster as the
        other style tools.
- [ ] Add README_AI.md row adjacent to `set_layer_opacity` /
      `set_layer_stroke_width` / `set_font_family`. Must include the API-key
      note and example prompts.
- [ ] `npm run build` — must succeed.
- [ ] `npm test` — must pass (baseline 2279 → +N new).
- [ ] `npm run lint` — must match baseline (7 warnings / 1 info / 0 errors).
- [ ] `git add` specific files, then commit with message
      `feat(ai): add set_layer_filter tool`.
