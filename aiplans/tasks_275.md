# Tasks — Plan 275 (`get_layer_visibility`)

- [x] Study `set-layer-visibility.ts`, `get-layer-style.ts`, `_shared/`.
- [x] Confirm `LAYER_SPECS` is already exported (it is — `src/ai/index.ts` line 1963).
- [x] Confirm `layerIsOn` semantics in `public/modules/ui/layers.js`
      (true iff `#buttonId` lacks `.buttonoff`).
- [x] Write plan doc (`plan_275.md`).
- [ ] Implement `src/ai/tools/get-layer-visibility.ts`:
  - [ ] Import `LAYER_SPECS` + `LayerSpec` from `./set-layer-visibility`.
  - [ ] Build lowercase lookup Map (canonical + aliases).
  - [ ] Export `LayerVisibilityRuntime { isOn(buttonId): boolean }` seam.
  - [ ] Export `defaultLayerVisibilityRuntime` — delegates to
        `layerIsOn` global, falls back to DOM class check, `false` when
        `document` is undefined.
  - [ ] Export `createGetLayerVisibilityTool(runtime?)` factory.
  - [ ] Export `getLayerVisibilityTool` (default instance).
  - [ ] Tool schema: optional `layer: string` only. No `required` array.
  - [ ] `execute`: when `layer` absent → iterate every spec; when present →
        validate type/non-empty, resolve via lookup, 1-entry array.
  - [ ] Always `{ok: true, layers: [...]}` on success.
- [ ] Implement `src/ai/tools/get-layer-visibility.test.ts`:
  - [ ] Unit suite (mocked runtime): full-dump ordering, single-layer match,
        alias match ("state borders" → borders), case-insensitivity,
        unknown-layer error + supported list, non-string `layer` rejection,
        runtime `isOn` invoked only for queried layers (spec smoke).
  - [ ] `defaultLayerVisibilityRuntime (integration)` describe block with
        `beforeEach`/`afterEach` that swaps `globalThis.document` and
        `globalThis.layerIsOn`. Use `as unknown as { ... }` casts.
  - [ ] Tool-level assertions: `name === "get_layer_visibility"`, schema
        has no `required` array (or has `required: []`).
- [ ] Register + re-export in `src/ai/index.ts`:
  - [ ] Import next to `getLayerStyleTool`.
  - [ ] Add export block with `createGetLayerVisibilityTool`,
        `defaultLayerVisibilityRuntime`, `getLayerVisibilityTool`,
        `type LayerVisibilityRuntime`.
  - [ ] `registry.register(getLayerVisibilityTool)` near
        `setLayerVisibilityTool` / `getLayerStyleTool`.
- [ ] Update `README_AI.md`: insert row right after the `set_layer_visibility`
      row (line 17). Mention optional `layer`, return shape, read-only,
      Anthropic API-key requirement, 2-3 example prompts.
- [ ] `npm run build` — must pass.
- [ ] `npm test` — must pass (baseline 4971 → +new tests).
- [ ] `npm run lint` — must match baseline (7 warnings / 1 info / 0 errors).
- [ ] Commit `feat(ai): add get_layer_visibility tool`.
