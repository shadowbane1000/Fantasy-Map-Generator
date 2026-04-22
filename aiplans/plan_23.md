# Plan 23 — Use Case: Change a province's color

## Status

Iteration 23. 22 AI tools + shared helpers in place. Baseline 7
warnings / 1 info / 0 errors. 301 tests pass.

## Use Case

**"Change the display color of a specific province."**

The user clicks the color swatch in a province row of the Provinces
Editor. `changeFill(el)` in
`public/modules/ui/provinces-editor.js:247-260` runs:

```js
pack.provinces[p].color = newFill;
provs.select("#provincesBody #province" + p).attr("fill", newFill);
provs.select("#provincesBody #province-gap" + p).attr("stroke", newFill);
```

Prompts:
- *"Make the Duchy of Rookwood #336699."*
- *"Color province 3 goldenrod."*

### Success criteria

1. `set_province_color({province: 3, color: "#336699"})` sets
   `pack.provinces[3].color = "#336699"` and updates
   `#province3[fill]` and `#province-gap3[stroke]`.
2. `set_province_color({province: "rookwood", color: "red"})` resolves
   case-insensitive name/fullName.
3. Rejects province 0 (placeholder).
4. Rejects unknown ref.
5. Invalid CSS color → error.
6. Runtime throws → error.
7. Invalid ref types → error.

## Scope

In-scope: `set_province_color` tool, `ProvinceColorRuntime` seam,
registry + README + tests.

Out-of-scope: changing capital, state, formName, coa (future).

## Design

New file: `src/ai/tools/set-province-color.ts`. Shape mirrors
`set-state-color.ts` (fill + gap stroke) minus the halo. Reuses
`findEntityByRef`, `isValidCssColor`, `errorResult`, `okResult`.

Province matches on both `name` and `fullName` (via
`findEntityByRef`), consistent with `rename_province`.

## Files

Create: `plan_23.md`, `tasks_23.md`,
`src/ai/tools/set-province-color.ts`,
`src/ai/tools/set-province-color.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-province-color.test.ts`) — 8 cases mirroring
`set-culture-color.test.ts`:

1. id + hex color.
2. name + named color (case-insensitive).
3. Color trimmed.
4. Reject province 0.
5. Unknown ref → error.
6. Invalid color → error.
7. Invalid ref types → error.
8. Runtime throws → error.

## Plan ↔ tasks ↔ tests verification

Same pattern as prior color tools. Each criterion has a test.

Lint / test / build gates in tasks_23.md.
