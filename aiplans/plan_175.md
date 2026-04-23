# Plan 175 — `set_layer_stroke_dasharray` AI tool

## Goal
Expose the Style Editor's `stroke-dasharray` input (`styleStrokeDasharrayInput`,
`public/modules/ui/style.js` line 464) as a registered AI tool, mirroring the
direct-analog pattern established by `set_layer_stroke_width` and
`set_layer_stroke_color`.

## Use case
Agent can create dashed / dotted line patterns on any map layer — e.g. dashed
state borders, dotted routes — by writing the SVG `stroke-dasharray` attribute
on the layer's `<g>` element. Empty string / "none" clears the attribute so
children return to solid strokes.

## Shape
- **Tool name**: `set_layer_stroke_dasharray`
- **Inputs**:
  - `layer` (string, required) — canonical or alias, matching
    `set_layer_visibility` / `set_layer_opacity`.
  - `dasharray` (string, required) — SVG stroke-dasharray value: space-
    or comma-separated finite non-negative numbers (e.g. `"5,5"`,
    `"2 4 2"`, `"10 5"`). Empty string or `"none"` clears.
- **Returns**: `{ ok, layer, previousDasharray, dasharray }` where
  `previousDasharray` is the raw prior attribute string or `null` when absent,
  and `dasharray` is the stored value (`""` for clear, trimmed otherwise).
- **Errors**: unknown layer (with supported list), empty/missing layer,
  non-string / malformed dasharray, element missing from DOM, document
  unavailable.

## DOM mapping
Same `CANONICAL_TO_SVG_ID` table the sibling stroke tools carry locally
(kept self-contained, no cross-tool re-export). Lookup keys lowercase,
populated from `LAYER_SPECS` (canonical + aliases).

## Validation
Loose validator: string is valid if trimmed string is empty (clear), equals
`"none"` (case-insensitive, clear), or consists of whitespace / commas /
non-negative finite decimal numbers only. Implementation: split on `[\s,]+`,
require ≥1 token, every token must `Number.parseFloat` to a finite
non-negative number. `Number.isFinite` excludes `NaN`/`±Infinity`.

When clearing, write `""` to the attribute (matches Style Editor behaviour
when the input is empty).

## Runtime seam
`LayerStrokeDasharrayRuntime { readDasharray, setDasharray }` +
`defaultLayerStrokeDasharrayRuntime` reading/writing the `stroke-dasharray`
attribute via `document.getElementById`. Mirrors stroke-color exactly.

## Tests (Vitest, node env)
Seam block:
1. sets on rivers — read+set calls, full return shape.
2. alias `"state borders"` → canonical `borders`.
3. `heightmap` → `#terrs`.
4. `burgs` → `#burgIcons`.
5. `cultures`/`religions` → `#cults`/`#relig`.
6. case-insensitive layer names.
7. accepts multiple dasharray forms: `"5,5"`, `"2 4 2"`, `"10 5"`,
   `"1,2,3,4"`, `"0"`.
8. trims whitespace from dasharray before writing.
9. clears with `""` → stored as `""`.
10. clears with `"none"` / `"NONE"` → stored as `""`.
11. unknown layer → error + supported list.
12. missing/empty layer → error.
13. rejects non-string / malformed values (negatives, letters, bare commas,
    single trailing comma producing empty token).
14. surfaces `setDasharray` throw.
15. `previousDasharray: null` when runtime returns null.
16. schema/name sanity.

Default-runtime integration block using a fake document:
1. writes the attribute and returns `previousDasharray`.
2. returns `previousDasharray: null` when attribute is absent.
3. errors when element is missing.
4. errors when `document` is `undefined`.
5. alias routing through to `#borders`.
6. clearing (`""`) writes an empty string attribute (previous value was set).

## Registration
Add `setLayerStrokeDasharrayTool` import + `registry.register(...)` in
`src/ai/index.ts` next to `setLayerStrokeColorTool`. Add the matching
`export { ... } from "./tools/set-layer-stroke-dasharray"` block.

## README_AI.md
One row after `set_layer_stroke_color`, same column shape (description with
API-key note + 2–3 example prompts).

## Verification
- `npm run build` — must succeed.
- `npm test` — 2396 + 22 = 2418 new tests.
- `npm run lint` — must match baseline (7 warn / 1 info / 0 err).

## Risks / non-goals
- Not validating strict SVG spec dasharray syntax (percentages etc.) — a loose
  numeric-with-separators filter is enough and matches what the Style Editor
  input allows.
- Not triggering `drawGrid()` after the write. The Style Editor UI only
  re-draws the grid for the gridOverlay case; other layers update immediately
  from the attribute change. Keep the tool a pure attribute write to stay
  aligned with `set_layer_stroke_width` / `set_layer_stroke_color`.
