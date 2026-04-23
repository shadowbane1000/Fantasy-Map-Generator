# Tasks 170 — `set_layer_fill` AI tool

- [x] Study `public/modules/ui/style.js` `styleFillInput` handler (lines
      444-447).
- [x] Study `set-layer-opacity.ts`, `set-layer-stroke-width.ts` for runtime
      seam / alias resolution / error shape.
- [x] Study `set-biome-color.ts`, `set-state-color.ts` for `isValidCssColor`
      helper.
- [ ] Write `src/ai/tools/set-layer-fill.ts`:
      - `CANONICAL_TO_SVG_ID` mirroring the shared pattern (local copy, no
        cross-tool import — same style as the sibling layer tools).
      - `LayerFillRuntime` interface.
      - `defaultLayerFillRuntime` using `document.getElementById`.
      - `createSetLayerFillTool(runtime)` + `setLayerFillTool` default.
      - Re-use `isValidCssColor` from `./set-state-color`.
- [ ] Write `src/ai/tools/set-layer-fill.test.ts` with pure-mock unit tests
      plus a `describe("defaultLayerFillRuntime (integration)")` block using
      `as unknown as { ... }` casts to stub `globalThis.document`.
- [ ] Register in `src/ai/index.ts`:
      - import.
      - export block after `setLayerStrokeWidthTool` exports.
      - `registry.register(setLayerFillTool)` in the same cluster as the
        other style tools.
- [ ] Add README_AI.md row adjacent to `set_layer_opacity` /
      `set_layer_stroke_width`. Must include the API-key note and example
      prompts.
- [ ] `npm run build` — must succeed.
- [ ] `npm test` — must pass (baseline + new).
- [ ] `npm run lint` — must match baseline (7 warnings / 1 info / 0 errors).
- [ ] `git add` specific files, then commit with message
      `feat(ai): add set_layer_fill tool`.
