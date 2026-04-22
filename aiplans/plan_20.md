# Plan 20 — Use Case: Change a culture's color

## Status

Iteration 20. 19 tools implemented (`save_map` added last).
Baseline 7 warnings / 1 info / 0 errors. 242 tests pass.

## Use Case

**"Change the display color of a specific culture."**

The user does this via the color swatch in the Cultures Editor.
`cultureChangeColor` in
`public/modules/dynamic/editors/cultures-editor.js:322-335` runs:

```js
pack.cultures[i].color = newFill;
cults.select("#culture" + i).attr("fill", newFill);
debug.select("#cultureCenter" + i).attr("fill", newFill);
```

Simpler than state recolor (no halo/gap), but otherwise parallel.

Prompts:
- *"Make the Highlanders culture #336699."*
- *"Color culture 2 seagreen."*

### Success criteria

1. `set_culture_color({culture: 2, color: "#336699"})` sets
   `pack.cultures[2].color = "#336699"` and updates
   `#culture2[fill]` and `#cultureCenter2[fill]`.
2. `set_culture_color({culture: "highlanders", color: "red"})`
   resolves by case-insensitive name.
3. Rejects culture 0 (Wildlands).
4. Rejects unknown ref.
5. Validates color via the shared `isValidCssColor` from
   `set-state-color.ts`.
6. Runtime throws → structured error.
7. Invalid ref types rejected.

## Scope

In-scope: `set_culture_color` tool with `CultureColorRuntime` seam,
registry + README + tests. Reuses `isValidCssColor`.

Out-of-scope: changing type / expansionism / base / shield (future).

## Design

New file: `src/ai/tools/set-culture-color.ts`.

```ts
export interface CultureColorRef {
  i: number;
  name: string;
  previousColor: string | null;
}
export interface CultureColorRuntime {
  find(ref: number | string): CultureColorRef | null;
  applyColor(i: number, color: string): void;
}
```

Default runtime mutates `pack.cultures[i].color`, updates
`#culture{i}[fill]` and `#cultureCenter{i}[fill]`.

## Files

Create: `plan_20.md`, `tasks_20.md`,
`src/ai/tools/set-culture-color.ts`,
`src/ai/tools/set-culture-color.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-culture-color.test.ts`):

1. Numeric id + hex color → applyColor called; result reports
   previous + new.
2. String ref + named color.
3. Reject culture 0 (Wildlands).
4. Unknown ref → error.
5. Invalid color → error.
6. Invalid ref types → error.
7. Runtime throw → error.
8. Color trimmed before calling runtime.

## Plan ↔ tasks ↔ tests verification

Same pattern as `set_state_color` with a simpler payload. Each
criterion has a matching test.

Lint / test / build gates in tasks_20.md.
