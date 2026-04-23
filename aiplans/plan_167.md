# Plan 167 — `set_font_family` AI tool

## Goal

Add an AI tool that lets the assistant set the `font-family` attribute on one
of the text-bearing SVG layer groups, mirroring the Style Editor's per-layer
font picker (`styleSelectFont.on("change", ...)`).

## How fonts work on the map (study findings)

`public/modules/ui/style.js:810-816` is the canonical font-change site:

```js
styleSelectFont.on("change", changeFont);
function changeFont() {
  const family = styleSelectFont.value;
  getEl().attr("font-family", family);
  if (styleElementSelect.value === "legend") redrawLegend();
}
```

- Font is a `font-family` **attribute** on the `<g>` element (not inline
  `style`). Child `<text>` / `<textPath>` elements inherit it.
- The Style Editor only exposes the font picker when the selected element is
  one of: `provs`, `labels`, `legend` (see style.js:256–278, 330–332).
- When element is `labels`, a sub-group can be selected — under `#labels` the
  children are `#states`, `#addedLabels`, `#burgLabels` (see
  `public/main.js:103-105`), and under `#burgLabels` dynamic per-group
  sub-groups (e.g. `#cities`, `#towns`) are appended by
  `src/renderers/draw-burg-labels.ts:96`.
- `src/modules/fonts.ts:348-366` (`getUsedFonts`) confirms the fonts that
  matter are: each `#labels g` (i.e. `#states`, `#addedLabels`, `#burgLabels`
  and its children), `provs`, and `#legend`. These are the layers we will
  expose.
- A single map-wide "all" alias will set `font-family` on `#labels`, `#provs`,
  and `#legend` — the root groups whose text inherits (children inherit
  unless they override).

## Targetable layer groups

The tool's `layer` parameter accepts the following canonical names (aliases
resolve case-insensitively):

| Canonical name     | SVG id          | Aliases                                                    |
| ------------------ | --------------- | ---------------------------------------------------------- |
| `labels`           | `#labels`       | all labels, map labels                                      |
| `state_labels`     | `#states`       | state labels, states labels (child `<g>` of `#labels`)      |
| `added_labels`     | `#addedLabels`  | added labels, custom labels (child `<g>` of `#labels`)      |
| `burg_labels`      | `#burgLabels`   | burg labels, burgs labels, city labels (child of `#labels`) |
| `province_labels`  | `#provs`        | province labels, provinces                                  |
| `legend`           | `#legend`       | legend                                                     |
| `all`              | *(pseudo)*      | all, everything, all layers                                 |

`all` applies the change to `#labels`, `#provs`, and `#legend`
(the three root layers `getUsedFonts` reads from).

Any other value (including `#cities`, `#towns`, etc — legitimate
`styleGroupSelect` sub-sub-groups under `#burgLabels`) is rejected with a
structured error listing the supported canonical names.

## Runtime seam

```ts
interface FontFamilyRuntime {
  readFontFamily(svgId: string): string | null;
  setFontFamily(svgId: string, font: string): void;
}
```

Default runtime uses `document.getElementById(id).getAttribute("font-family")`
and `setAttribute("font-family", font)` — exactly what the Style Editor does.

## Contract

Input:

```ts
{ layer: string; font: string }
```

Output (success):

```ts
{ ok: true, layer: string, previousFont: string | null, font: string,
  applied?: Array<{layer: string, svgId: string, previousFont: string|null}> }
```

The `applied` array is only set when `layer === "all"`; in that case the
top-level `layer` / `previousFont` reflect the first applied layer
(`labels`) for a stable shape.

Error cases:

- `layer` missing / empty string → error.
- `font` missing / empty / whitespace → error.
- Unknown layer → error with `supported` array.
- DOM lookup failure (element absent, no `document`) → error.

## Mutation

- Write `font-family` attribute on the `<g>` via `setAttribute`.
- No redraw is required — SVG text re-renders immediately because the
  attribute is inherited by child `<text>`/`<textPath>`.
- For parity with the Style Editor we intentionally do **not** call
  `redrawLegend()`: the style editor does that only when the *legend* element
  is selected to refresh positioning based on the new font-metric; that's a
  UI concern orthogonal to setting the attribute. The tool keeps the
  mutation minimal and declarative — leaving legend text recentering to the
  user toggling the legend, consistent with how `set_layer_opacity` only
  writes `opacity`.

## Testing

Unit tests (mocked runtime) cover:

- Sets `font-family` on `#labels` for `layer="labels"`.
- Aliases (`"state labels"` → `state_labels` → `#states`, `"burg labels"` →
  `#burgLabels`, `"province labels"` → `#provs`).
- Case-insensitive layer lookup.
- Rejects missing / whitespace-only `layer`, `font`.
- Rejects unknown layer, with `supported` array.
- Surfaces runtime errors as `errorResult`.
- `layer="all"` calls runtime for `#labels`, `#provs`, `#legend` in order
  and reports `applied`.
- Reports `previousFont: null` when runtime returns null.

Integration block (`defaultFontFamilyRuntime`) with fake `document`:

- Writes the attribute on the real SVG element.
- Returns `previousFont` from existing attribute.
- `previousFont: null` when element absent or no attribute.
- Errors when `document` is undefined.
- "all" writes across multiple fake elements.

## Files

- `src/ai/tools/set-font-family.ts` (new).
- `src/ai/tools/set-font-family.test.ts` (new).
- `src/ai/index.ts` (import + register + re-export).
- `README_AI.md` (row inserted near `set_layer_opacity`).

## Verification

- `npm run lint` — baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must pass.
- `npm test` — must pass (all).
