# Tasks 206 — `get_layer_style`

## Implementation

- [ ] `src/ai/tools/get-layer-style.ts`
  - [ ] Inline `CANONICAL_TO_SVG_ID` table (same entries as `set-layer-opacity.ts`)
  - [ ] Build `LOOKUP` map from `LAYER_SPECS` aliases → `{canonical, svgId}`
  - [ ] `LayerStyleAttrs` interface — `{opacity, fill, stroke, strokeWidth, strokeDasharray, filter}` with `number | null` / `string | null` types
  - [ ] `LayerStyleRuntime` interface — `read(svgId): LayerStyleAttrs | null`
  - [ ] `defaultLayerStyleRuntime` — returns `null` when element missing; otherwise reads each of the 6 attrs; parses `opacity` and `stroke-width` as numbers; empty-string attrs normalise to `null`
  - [ ] `createGetLayerStyleTool(runtime = default)` — rejects non-string / empty `layer`; unknown layer returns structured `supported` error; missing element returns structured error
  - [ ] Export `getLayerStyleTool` convenience instance

- [ ] `src/ai/tools/get-layer-style.test.ts`
  - [ ] Tool-surface describe using injected runtime
  - [ ] Integration describe stubbing `globalThis.document.getElementById`
  - [ ] Use `as unknown as { ... }` casts for fake document

- [ ] `src/ai/index.ts`
  - [ ] `import { getLayerStyleTool } from "./tools/get-layer-style";`
  - [ ] Re-export `createGetLayerStyleTool`, `defaultLayerStyleRuntime`, `LayerStyleRuntime`, `LayerStyleAttrs`, `getLayerStyleTool`
  - [ ] Register `getLayerStyleTool` in `buildDefaultRegistry` — directly after `setLayerFillTool`

- [ ] `README_AI.md`
  - [ ] Add row after the `set_layer_fill` row — describe the six attrs returned, null semantics, layer alias set, example prompts, API key blurb

## Verification

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run lint` — still 7 warnings / 1 info / 0 errors
- [ ] Commit with scoped files (tool, test, `src/ai/index.ts`, `README_AI.md`, `aiplans/plan_206.md`, `aiplans/tasks_206.md`)
