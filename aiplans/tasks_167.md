# Tasks 167 — `set_font_family`

- [x] Study `public/modules/ui/style.js` font handlers (`changeFont`,
      `getEl`, `styleSelectFont`).
- [x] Study `src/modules/fonts.ts` `getUsedFonts` to confirm which groups
      store the map's "used fonts".
- [x] Study `public/modules/ui/labels-editor.js` to confirm there is no
      per-label font-family (inherited from the parent `<g>`).
- [x] Study `src/ai/tools/set-layer-opacity.ts` + test (runtime-seam
      pattern, error handling).
- [x] Study `src/ai/tools/set-label-text.ts` (text / DOM mutation
      pattern).
- [x] Study `src/ai/tools/_shared` (`errorResult` / `okResult`).
- [x] Write `aiplans/plan_167.md` (this plan) enumerating supported
      layers.
- [x] Create `src/ai/tools/set-font-family.ts`:
  - `FontFamilyRuntime` interface with `readFontFamily` + `setFontFamily`.
  - `defaultFontFamilyRuntime` using `document.getElementById` +
    `getAttribute("font-family")` + `setAttribute("font-family", …)`.
  - `createSetFontFamilyTool(runtime)` → `Tool` with
    `input_schema: { layer, font }`.
  - Alias table covering `labels`, `state_labels`, `added_labels`,
    `burg_labels`, `province_labels`, `legend`, plus `all`.
  - `execute` validates inputs, resolves alias, calls runtime, returns
    `{ok, layer, previousFont, font, applied?}`.
  - Export `setFontFamilyTool = createSetFontFamilyTool()`.
- [x] Create `src/ai/tools/set-font-family.test.ts`:
  - Mock-runtime suite: success (labels), aliases, case-insensitive,
    unknown layer error, missing/empty layer/font, runtime-throw
    surfaced as errorResult, `all` multi-write, `previousFont: null`.
  - Integration suite using `defaultFontFamilyRuntime` with fake
    `document` (mirrors `set-layer-opacity.test.ts`): writes attribute,
    reports previous, null when absent, errors without document, `all`
    across multiple elements.
- [x] Register in `src/ai/index.ts`:
  - Import alongside `setLayerOpacityTool`.
  - Re-export `createSetFontFamilyTool`, `defaultFontFamilyRuntime`,
    `FontFamilyRuntime`, `setFontFamilyTool`, `FONT_LAYERS`.
  - `registry.register(setFontFamilyTool)` next to
    `setLayerOpacityTool`.
- [x] Add README_AI.md row for `set_font_family` near `set_layer_opacity`.
- [x] Run `npm run lint` — match baseline (7 / 1 / 0).
- [x] Run `npm run build` — clean build.
- [x] Run `npm test` — all pass.
- [x] Commit `feat(ai): add set_font_family tool` with 1-2 line body.
