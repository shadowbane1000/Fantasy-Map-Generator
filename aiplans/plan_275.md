# Plan 275 — `get_layer_visibility` AI tool

## Goal
Add a read-only AI tool `get_layer_visibility` that reports the current on/off
state of one or every named map layer. It is the inverse / readback analog of
`set_layer_visibility`.

## Shape
- Optional `layer` string argument. When omitted → return every registered
  layer. When provided → return just that one (matched case-insensitively,
  aliases accepted — same lookup table as `set_layer_visibility`).
- Success: `{ ok: true, layers: [{layer, visible}, ...] }`. Always an array,
  even for single-layer queries (so the caller handles one code path).
- Error: structured `{ ok: false, error, supported? }` when the supplied layer
  name is unknown (include canonical list as `supported`) or when `layer` is
  not a string (non-empty `type` check only — omitting it is valid).

## Reuse
- Re-uses `LAYER_SPECS` / alias lookup from `./set-layer-visibility.ts`
  (imported, not duplicated).
- Re-uses the same underlying read (`layerIsOn(buttonId)` global → fallback to
  `!el.classList.contains("buttonoff")`). Expressed through a
  `LayerVisibilityRuntime { isOn(buttonId) }` runtime seam that mirrors the
  `LayerRuntime.isOn` half of `set-layer-visibility`.

## File layout
- `src/ai/tools/get-layer-visibility.ts` — tool + factory + runtime seam.
- `src/ai/tools/get-layer-visibility.test.ts` — unit tests (mock runtime) +
  `defaultLayerVisibilityRuntime (integration)` block poking
  `globalThis.document` / `globalThis.layerIsOn`.
- Register `getLayerVisibilityTool` in `src/ai/index.ts` next to
  `getLayerStyleTool`. Re-export in the public surface block.
- Add row in `README_AI.md` immediately after the `set_layer_visibility` row.

## Risks / edge cases
- `layerIsOn` global may be absent in test/SSR contexts — fallback path reads
  DOM class. If `document` is also absent, treat as "hidden" (mirrors
  `set-layer-visibility.ts`'s `defaultLayerRuntime.isOn`).
- Tool must NOT mutate anything. No `toggle` on the runtime.
- Single-layer result must still be an array (per use-case spec).

## Out of scope
- Exposing per-layer child visibility (sublayers) or CSS `display`/`opacity`
  heuristics — we report the same "button on/off" semantics as the UI's own
  `layerIsOn()`, which is the definitional source of truth.
