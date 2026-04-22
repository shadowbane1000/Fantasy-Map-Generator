# Plan 22 — Use Case: Change a religion's color

## Status

Iteration 22. 21 AI tools + shared helpers already in place. Baseline
7 warnings / 1 info / 0 errors. 293 tests pass.

## Use Case

**"Change the display color of a specific religion."**

The user clicks the color swatch in a religion row of the Religions
Editor. `religionChangeColor` in
`public/modules/dynamic/editors/religions-editor.js:341-354` runs:

```js
pack.religions[i].color = newFill;
relig.select("#religion" + i).attr("fill", newFill);
debug.select("#religionsCenter" + i).attr("fill", newFill);
```

Structurally identical to `set_culture_color` (three-line side-effect:
data + fill + center-marker), so this tool reuses the shared helpers
and the `isValidCssColor` validator.

Prompts:
- *"Make the Old Faith religion #336699."*
- *"Color religion 2 goldenrod."*

### Success criteria

1. `set_religion_color({religion: 2, color: "#336699"})` sets
   `pack.religions[2].color = "#336699"` and updates `#religion2[fill]`
   and `#religionsCenter2[fill]`.
2. `set_religion_color({religion: "old faith", color: "red"})`
   resolves by case-insensitive name.
3. Rejects religion 0 ("No religion" placeholder).
4. Rejects unknown ref.
5. Invalid CSS color → structured error.
6. Runtime throws → structured error.
7. Invalid ref types rejected.

## Scope

In-scope: `set_religion_color` tool with `ReligionColorRuntime` seam,
registry + README + tests.

Out-of-scope: changing type / form / deity / expansion (future).

## Design

New file: `src/ai/tools/set-religion-color.ts`. Same shape as
`set-culture-color.ts`, reusing `findEntityByRef`, `errorResult`,
`okResult`, and `isValidCssColor`.

## Files

Create: `plan_22.md`, `tasks_22.md`,
`src/ai/tools/set-religion-color.ts`,
`src/ai/tools/set-religion-color.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-religion-color.test.ts`) — 8 cases mirroring
`set-culture-color.test.ts`:

1. Numeric id + hex color.
2. Case-insensitive name + named color.
3. Color trimmed.
4. Reject religion 0.
5. Unknown ref → error.
6. Invalid color → error.
7. Invalid ref types → error.
8. Runtime throws → error.

## Plan ↔ tasks ↔ tests verification

Identical pattern to `set_culture_color`. Each criterion has a test.

Lint / test / build gates in tasks_22.md.
