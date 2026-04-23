# Plan 169 — `set_layer_filter` AI tool

## Goal

Add an AI tool `set_layer_filter` that applies one of the SVG filters defined
in `<defs>` to a named map layer — the same side-effect as the Style Editor's
per-layer filter dropdown (`styleFilterInput`, see `public/modules/ui/style.js`
lines 4-18 and 478-481). The tool writes the `filter` attribute on the layer's
`<g>` element (`filter="url(#<id>)"`) or clears it.

## Use case

- Input: `layer` (string, same aliases as `set_layer_opacity` /
  `set_layer_stroke_width`), `filter` (string, name of a predefined filter id,
  or the empty string / `"none"` to clear).
- Output: `{ ok: true, layer, previousFilter, filter }`.
  - `previousFilter` is the raw attribute value as a string (e.g.
    `"url(#dropShadow)"`) or `null` when absent.
  - `filter` is the applied attribute string (`"url(#dropShadow)"` or `""`).

## Valid filter ids

Collected from `src/index.html` `<g id="filters">…</g>`:

1. `blurFilter` — Blur 0.2
2. `blur1` — Blur 1
3. `blur3` — Blur 3
4. `blur5` — Blur 5
5. `blur7` — Blur 7
6. `blur10` — Blur 10
7. `splotch` — Splotch
8. `bluredSplotch` — Blurred Splotch
9. `dropShadow` — Shadow 2
10. `dropShadow01` — Shadow 0.1
11. `dropShadow05` — Shadow 0.5
12. `outline` — Outline
13. `pencil` — Pencil
14. `turbulence` — Turbulence
15. `paper` — Paper
16. `crumpled` — Crumpled
17. `filter-grayscale` — Grayscale
18. `filter-sepia` — Sepia
19. `filter-dingy` — Dingy
20. `filter-tint` — Tint

Clear values: `""`, `"none"`, `null` — all map to clearing via `filter=""`
(matching the Style Editor's "None" option which uses `value=""`).

We also accept common human names as aliases (case-insensitive) to the id set:

- `sepia` → `filter-sepia`
- `grayscale` / `greyscale` → `filter-grayscale`
- `dingy` → `filter-dingy`
- `tint` → `filter-tint`
- `shadow` → `dropShadow`
- `blur` → `blur3` (sensible default; explicit ids still work)

## Layer resolution

Re-use the `CANONICAL_TO_SVG_ID` table and alias map pattern from
`set-layer-opacity.ts` / `set-layer-stroke-width.ts` (same surface so a user
saying "rivers" or "state borders" resolves identically). The canonical names
come from `LAYER_SPECS` in `set-layer-visibility.ts`.

Note: Style Editor hides the filter row for `landmass`, `legend`, `regions`,
`scaleBar` (style.js line 104). We do NOT replicate that UX restriction —
writing `filter` to any group is valid SVG; the user gets a sensible structural
result and we avoid divergence with the other style tools that already accept
`states` (→#regions). If the DOM element is absent, the runtime throws a clear
error.

## Architecture

Runtime-seam pattern (matches `set-font-family.ts` / `set-layer-opacity.ts`):

```ts
export interface LayerFilterRuntime {
  readFilter(svgId: string): string | null;
  setFilter(svgId: string, filter: string): void;
}
export const defaultLayerFilterRuntime: LayerFilterRuntime = { … };
export function createSetLayerFilterTool(
  runtime: LayerFilterRuntime = defaultLayerFilterRuntime
): Tool { … }
export const setLayerFilterTool = createSetLayerFilterTool();
```

`setFilter(svgId, "")` clears via `setAttribute("filter", "")` — matches the
Style Editor change-handler which writes `this.value` directly and uses `""`
for the "None" option.

## Validation

1. `layer` must be a non-empty string; must resolve via `LOOKUP` (else return
   `supported` list).
2. `filter` must be a string (may be empty). Trim then lowercase.
3. Empty / `"none"` → write `""`; result field `filter: ""`.
4. Any other value → canonicalise to a known filter id (raw id first, then
   alias map, case-insensitive); write `url(#<id>)`.
5. Unknown filter name → error with `supported` (list of raw ids).

## Files

- `src/ai/tools/set-layer-filter.ts` — tool + runtime + exports.
- `src/ai/tools/set-layer-filter.test.ts` — unit tests + integration via
  `defaultLayerFilterRuntime` with a fake `document`.
- `src/ai/index.ts` — import + re-export + `registry.register`.
- `README_AI.md` — new row adjacent to `set_layer_opacity`.

## Tests

Unit (pure-runtime mock):

- sets `filter="url(#dropShadow)"` on `#rivers` when layer="rivers",
  filter="dropShadow".
- resolves alias `sepia` → `filter-sepia`, writes `url(#filter-sepia)`.
- resolves alias `grayscale` → `filter-grayscale`.
- resolves alias `shadow` → `dropShadow`.
- resolves `"none"` and `""` as clear-filter (writes `""`).
- case-insensitive for both layer and filter names.
- resolves canonical layer alias `state borders` → `#borders`.
- resolves `heightmap` → `#terrs`.
- returns `previousFilter` from runtime.
- errors on missing/empty/non-string `layer`.
- errors on missing/non-string `filter` (empty-string is allowed).
- errors on unknown filter id with `supported` list including `dropShadow`,
  `filter-sepia`.
- errors on unknown layer with `supported` list.
- surfaces `setFilter` throw as errorResult.
- exposes `name === "set_layer_filter"` and `required: ["layer", "filter"]`.

Integration (defaultLayerFilterRuntime w/ fake `document`):

- writes attribute on the SVG element.
- reports `previousFilter` = existing attr value; `null` when absent.
- errors when element is missing.
- errors when `document` is unavailable.
- `"none"` clears to empty string.

## Non-goals

- We do not mutate `ocean`/`oceanLayers` the way style.js special-cases the
  ocean group; users who need that can use `set_layer_filter layer="ocean"` —
  our table does not include `ocean` (it's a composite in the Style Editor UI,
  not a simple layer `<g>`). Calling it will be rejected as unknown.
- We do not alter Style Editor inputs — only the SVG DOM. That matches
  `set_layer_opacity` / `set_layer_stroke_width` behavior.
