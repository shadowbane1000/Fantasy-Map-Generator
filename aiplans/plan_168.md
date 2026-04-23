# Plan 168 — `set_font_size` AI tool

## Goal

Add an AI tool that lets the assistant set the `font-size` attribute on one
of the text-bearing SVG layer groups, mirroring the Style Editor's per-layer
font-size slider (`styleFontSize.on("change", ...)` → `changeFontSize`).
Parallel to the just-merged `set_font_family` (plan 167).

## How font-size works on the map (study findings)

`public/modules/ui/style.js:863-893` is the canonical font-size site:

```js
styleFontSize.on("change", function () {
  changeFontSize(getEl(), +this.value);
});
function changeFontSize(el, size) {
  styleFontSize.value = size;
  const getSizeOnScale = element => {
    if (element === "labels") return Math.max(rn((size + size / scale) / 2, 2), 1);
    if (element === "coordinates") return rn(size / scale ** 0.8, 2);
    return size;
  };
  const scaleSize = getSizeOnScale(styleElementSelect.value);
  el.attr("data-size", size).attr("font-size", scaleSize);
  if (styleElementSelect.value === "legend") redrawLegend();
}
```

- Font-size is a `font-size` **attribute** on the `<g>` element. The UI also
  writes `data-size` to preserve the user-authored size for re-reading on
  zoom (the `#labels` root group is rescaled with zoom, so `font-size` is
  derived from `data-size` each time). Child `<text>` inherits it.
- The HTML input (`src/index.html:1307`) is `type="number" min=".5" max="100"
  step=".1"` → the canonical bounds are [0.5, 100].
- The Style Editor exposes the font-size slider whenever a text-bearing
  element (`provs`, `labels`, `legend`, …) is selected — same surface as
  font-family.
- To mirror the Style Editor exactly we write **both** `data-size` and
  `font-size` with the same numeric value. We do NOT apply the
  `getSizeOnScale` zoom-scaling transform: that is dynamic (depends on
  `scale` and on which specific sub-group is selected), and writing raw
  `font-size = data-size` matches what the UI does for every layer other
  than the top-level `#labels` selection. For the `#labels` top-level case,
  omitting scaling is acceptable because `invokeActiveZooming` on the next
  zoom step (or any reGraph) will recompute font-size from `data-size`.
  This mirrors how `set_font_family` deliberately skips `redrawLegend`.
- `all` applies the change to `#labels`, `#provs`, and `#legend` — the three
  root groups that `getUsedFonts` reads from and that `set_font_family`
  also uses for `all`.

## Targetable layer groups

Same canonical names / aliases as `set_font_family` — we reuse the exported
`FONT_LAYERS` constant to avoid duplication.

| Canonical name     | SVG id          |
| ------------------ | --------------- |
| `labels`           | `#labels`       |
| `state_labels`     | `#states`       |
| `added_labels`     | `#addedLabels`  |
| `burg_labels`      | `#burgLabels`   |
| `province_labels`  | `#provs`        |
| `legend`           | `#legend`       |
| `all`              | *(pseudo)*      |

## Runtime seam

```ts
interface FontSizeRuntime {
  readFontSize(svgId: string): number | null;
  setFontSize(svgId: string, size: number): void;
}
```

Default runtime uses `document.getElementById(id).getAttribute("data-size")`
(falling back to `getAttribute("font-size")` when `data-size` is absent —
covers layers whose `data-size` hasn't been initialised yet) and
`setAttribute("data-size", size)` + `setAttribute("font-size", size)` on
write — exactly what the Style Editor does.

## Contract

Input:

```ts
{ layer: string; size: number }
```

Output (success):

```ts
{ ok: true, layer: string, previousSize: number | null, size: number,
  applied?: Array<{layer: string, svgId: string, previousSize: number|null}> }
```

The `applied` array is only set when `layer === "all"`; in that case the
top-level `layer` / `previousSize` reflect the first applied layer
(`labels`) for a stable shape.

Error cases:

- `layer` missing / empty string → error.
- `size` missing / not a finite number / outside [0.5, 100] → error.
- Unknown layer → error with `supported` array.
- DOM lookup failure (element absent, no `document`) → error.

## Mutation

- Write `data-size` and `font-size` attributes on the `<g>` via
  `setAttribute`.
- No redraw required — SVG text re-renders immediately; zoom-driven
  rescaling (`invokeActiveZooming`) will re-use `data-size` on next zoom
  step.
- For parity with `set_font_family` we intentionally do **not** call
  `redrawLegend()`: orthogonal UI concern.

## Testing

Unit tests (mocked runtime) cover:

- Sets `font-size` on `#labels` for `layer="labels"`.
- Aliases (`"state labels"` → `state_labels` → `#states`,
  `"burg labels"` → `#burgLabels`, `"province labels"` → `#provs`).
- Case-insensitive layer lookup.
- Rejects missing / non-number / out-of-range `size`.
- Rejects missing / whitespace-only `layer`.
- Rejects unknown layer, with `supported` array.
- Surfaces runtime errors as `errorResult`.
- `layer="all"` calls runtime for `#labels`, `#provs`, `#legend` in order
  and reports `applied`.
- Reports `previousSize: null` when runtime returns null.

Integration block (`defaultFontSizeRuntime`) with fake `document`:

- Writes both `data-size` and `font-size` on the real SVG element.
- Returns `previousSize` parsed from existing `data-size`
  (falls back to `font-size`).
- `previousSize: null` when element absent or attributes unparseable.
- Errors when `document` is undefined.
- "all" writes across multiple fake elements.

## Files

- `src/ai/tools/set-font-size.ts` (new).
- `src/ai/tools/set-font-size.test.ts` (new).
- `src/ai/index.ts` (import + register + re-export).
- `README_AI.md` (row inserted near `set_font_family`).

## Verification

- `npm run lint` — baseline 7 warnings / 1 info / 0 errors.
- `npm run build` — must pass.
- `npm test` — must pass (all).
