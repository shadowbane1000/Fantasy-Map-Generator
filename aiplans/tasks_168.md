# Tasks 168 — `set_font_size`

- [x] Study `public/modules/ui/style.js` font-size handlers
      (`changeFontSize`, `getEl`, `styleFontSize`).
- [x] Study `src/index.html` for the HTML input bounds — confirms
      `min=.5`, `max=100`, `step=.1`.
- [x] Study `src/ai/tools/set-font-family.ts` + test (direct analog
      just merged).
- [x] Study `src/ai/tools/set-layer-opacity.ts` + test (runtime-seam
      pattern).
- [x] Study `src/ai/tools/_shared` (`errorResult` / `okResult`).
- [x] Write `aiplans/plan_168.md`.
- [x] Create `src/ai/tools/set-font-size.ts`:
  - Re-use `FONT_LAYERS` and `FontLayerSpec` from `set-font-family.ts`
    (do not duplicate).
  - `FONT_SIZE_MIN = 0.5`, `FONT_SIZE_MAX = 100` constants (match
    HTML input bounds).
  - `FontSizeRuntime` interface with `readFontSize` + `setFontSize`.
  - `defaultFontSizeRuntime` using `document.getElementById` +
    `getAttribute("data-size")` / `getAttribute("font-size")` fallback +
    `setAttribute("data-size", …)` + `setAttribute("font-size", …)`.
  - `createSetFontSizeTool(runtime)` → `Tool` with
    `input_schema: { layer, size }`.
  - `execute` validates inputs (finite, in [0.5, 100]), resolves alias,
    calls runtime, returns `{ok, layer, previousSize, size, applied?}`.
  - Export `setFontSizeTool = createSetFontSizeTool()`.
- [x] Create `src/ai/tools/set-font-size.test.ts`:
  - Mock-runtime suite: success (labels), aliases, case-insensitive,
    unknown layer error, missing/empty/out-of-range size,
    missing/empty layer, runtime-throw surfaced as errorResult,
    `all` multi-write, `previousSize: null`.
  - Integration suite using `defaultFontSizeRuntime` with fake
    `document` (mirrors `set-font-family.test.ts`): writes both
    attributes, reports previous from `data-size` (with font-size
    fallback), `null` when absent, errors without document,
    `all` across multiple elements.
- [x] Register in `src/ai/index.ts`:
  - Import `setFontSizeTool` alongside `setFontFamilyTool`.
  - Re-export `createSetFontSizeTool`, `defaultFontSizeRuntime`,
    `FontSizeRuntime`, `FONT_SIZE_MAX`, `FONT_SIZE_MIN`,
    `setFontSizeTool`.
  - `registry.register(setFontSizeTool)` next to
    `setFontFamilyTool`.
- [x] Add README_AI.md row for `set_font_size` near `set_font_family`.
- [x] Run `npm run lint` — match baseline (7 / 1 / 0).
- [x] Run `npm run build` — clean build.
- [x] Run `npm test` — all pass.
- [x] Commit `feat(ai): add set_font_size tool` with 1-2 line body.
