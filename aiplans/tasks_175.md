# Tasks — Plan 175 (`set_layer_stroke_dasharray`)

- [ ] Baseline: `npm run lint 2>&1 | tail -5` → 7 warn / 1 info / 0 err. Record.
- [ ] Baseline: `npm test 2>&1 | tail -5` → 186 files / 2396 tests. Record.
- [ ] Read sibling files: `set-layer-stroke-width{.ts,.test.ts}`,
  `set-layer-stroke-color{.ts,.test.ts}`, `set-layer-opacity.ts`,
  `_shared/index.ts`, `style.js` stroke-dasharray handler.
- [ ] Write `src/ai/tools/set-layer-stroke-dasharray.ts` with runtime seam,
  local `CANONICAL_TO_SVG_ID`, validator, default runtime, `Tool` factory.
- [ ] Write `src/ai/tools/set-layer-stroke-dasharray.test.ts` covering the
  seam cases and the default-runtime integration block (fake document).
- [ ] Register in `src/ai/index.ts`: import + `export { … }` block + single
  `registry.register(setLayerStrokeDasharrayTool)` next to sibling stroke
  tools.
- [ ] Add a README_AI.md row mirroring `set_layer_stroke_color`'s shape —
  description with API key note + 2–3 example prompts.
- [ ] Verify: `npm run build`.
- [ ] Verify: `npm test` → 186 files / 2418 tests (2396 + 22 new).
- [ ] Verify: `npm run lint` matches baseline (7 warn / 1 info / 0 err).
- [ ] Commit: `feat(ai): add set_layer_stroke_dasharray tool` staging only
  changed/new files (plan + tasks + tool + test + index + README_AI).
