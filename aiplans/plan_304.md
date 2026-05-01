# Plan 304: `set_label_letter_spacing` tool

## Lint baseline (before any changes)

```
$ npm run lint
... (existing warnings only, no errors) ...
Found 7 warnings.
Found 1 info.
```

No errors at baseline. The 7 warnings + 1 info are pre-existing and unrelated
to this change (e.g. `src/renderers/draw-heightmap.ts` dynamic namespace
imports). Goal is to NOT regress this count.

## Use case

The legacy Edit Label dialog exposes a "Letter spacing" slider/section
(`#labelLetterSpacingSize`) that drives `changeLetterSpacingSize` in
`public/modules/ui/labels-editor.js`:

```js
function changeLetterSpacingSize() {
  elSelected.select("textPath").attr("letter-spacing", this.value + "px");
  tip("Label letter-spacing size: " + this.value + "px");
  changeText();
}
```

The user-visible feature: open Edit Label → drag the letter-spacing slider →
letters spread apart or condense. The AI assistant currently has no way to
adjust this.

This plan adds an AI tool `set_label_letter_spacing` that mirrors that legacy
handler — sets `letter-spacing="<n>px"` on a single label's `<textPath>`.

This is a direct sibling of the merged tools `set_label_size` (plan 301) and
`set_label_offset` (plan 302). The implementation is essentially a copy of
`set_label_offset.ts` with these substitutions:

- Attribute: `startOffset` → `letter-spacing`
- Unit suffix: `%` → `px`
- Range: `[20, 80]` → `[0, 20]`
- Result key: `old_offset`/`new_offset` → `old_letter_spacing`/`new_letter_spacing`
- Input key: `offset` → `letter_spacing`

The UI's `changeLetterSpacingSize` calls `changeText()` after writing the
attribute, but `changeText()` re-renders tspans from the current textbox
input — it preserves existing text. The AI tool only writes the attribute
(does NOT re-call `changeText()`), matching the divergence rationale in
`set_label_size` and `set_label_offset`. Without UI selection state /
element refs there's no clean way to re-render.

## Behavior (exact)

Input:

- `label_id`: required string. The `id` attribute on the `<text>`.
- `letter_spacing`: required number. The px value to write (no unit suffix —
  the tool adds `"px"`). Must be a finite number in `[0, 20]` inclusive.

Lookup:

- Reuse the same `findLabel` semantics as `set-label-group.ts` /
  `set-label-offset.ts`: only a `<text>` whose direct parent is a `<g>`
  directly under `#labels` is "found".

Effect:

- Find the sole `<textPath>` child of the resolved `<text>`.
- Read the previous value via `getAttribute("letter-spacing")` and parse it
  with `parseFloat` (mirrors what `labels-editor.js` does — `"3.5px"` → 3.5,
  `"2"` → 2, `null`/unparseable → null).
- Write `letter-spacing="<letter_spacing>px"` on the `<textPath>`.

Return: `okResult({ ok: true, label_id, old_letter_spacing, new_letter_spacing })`.

## Range rationale

The slider definition in `src/index.html` (`#labelLetterSpacingSize`,
roughly lines 2790–2805):

```html
<slider-input
  id="labelLetterSpacingSize"
  ...
  min="0"
  max="20"
  step=".01"
  value="0"
></slider-input>
```

There is no UI affordance for letter-spacing values outside this band, so
the AI tool clamps to the same range. Reject anything outside (and any
non-finite number) before touching the DOM.

## Files

New:

- `src/ai/tools/set-label-letter-spacing.ts` — the tool. Runtime-injection
  seam: `SetLabelLetterSpacingRuntime`, `defaultSetLabelLetterSpacingRuntime`,
  `createSetLabelLetterSpacingTool(runtime?)`, `setLabelLetterSpacingTool`.
  Reuses `LabelLookup` import from `set-label-group.ts`.
- `src/ai/tools/set-label-letter-spacing.test.ts` — Vitest unit + integration
  tests, modelled on `set-label-offset.test.ts`.

Modified:

- `src/ai/index.ts` — wire the new tool: import, re-export
  (`createSetLabelLetterSpacingTool`, `defaultSetLabelLetterSpacingRuntime`,
  `SetLabelLetterSpacingRuntime`, `setLabelLetterSpacingTool`), and
  `registry.register(setLabelLetterSpacingTool)` next to
  `setLabelOffsetTool` / `setLabelSizeTool`.

## Errors

- `label_id` missing/empty/non-string → `errorResult("label_id must be a non-empty string.")`.
- `letter_spacing` missing or not a number → `errorResult("letter_spacing must be a finite number.")`.
- `letter_spacing` not finite (NaN, ±Infinity) → same as above.
- `letter_spacing` out of `[0, 20]` → `errorResult("letter_spacing must be between 0 and 20 (got <n>).")`.
- `findLabel` `not_found` → `errorResult("No label found with id <id>.")`.
- `findLabel` `outside_labels` → `errorResult("Label <id> not found under #labels.")`.
- `findLabel` `unexpected_parent` → `errorResult("Label <id> has unexpected parent.")`.
- `findLabel` `labels_root_missing` → `errorResult("#labels SVG element not found.")`.
- `findTextPath` returns null → `errorResult("Label <id> has no <textPath>.")`.
- `setLetterSpacing` throws → surface its message.

## Self-review (mandatory)

Re-read of `plan_304.md` and `tasks_304.md` after first draft:

- Confirmed copy-from source: `set-label-offset.ts` and `set-label-offset.test.ts`
  (the most recently merged sibling, plan 302), not plan 301 — plan 302 is
  closer in shape (same DOM-only, no-pack-mutation pattern with a unit suffix).
- Confirmed range: slider in `src/index.html` is `min="0" max="20" step=".01"`
  — adopted verbatim with inclusive boundaries.
- Confirmed unit: legacy `changeLetterSpacingSize` writes `this.value + "px"`,
  not `%` — tool follows suit.
- Confirmed attribute name: `letter-spacing` (kebab-case SVG presentation
  attribute), not `letterSpacing`. `setAttribute("letter-spacing", ...)` is
  correct in SVG.
- Confirmed no `pack` mutation — purely SVG state, same as `set_label_offset`.
- Confirmed `parseFloat` handles `"3.5px"`, `"2"`, etc.; surfaces NaN as null.
- Confirmed wiring location near `setLabelOffsetTool` in import block, the
  re-export block, and the `registry.register(...)` block in `src/ai/index.ts`.
- Test plan covers all error branches and both boundaries (0 inclusive, 20
  inclusive). 0 is now a valid value (it was rejected as "out of range" in
  set_label_offset because that range was [20, 80]).
- Caveat: in `set_label_offset` the test "offset 100 / 0 / -10 → out of range"
  treated 0 as out-of-range. For letter_spacing 0 is INSIDE the range, so
  the boundary-success test must include 0; the out-of-range test list must
  use values strictly outside `[0, 20]` (e.g. `-0.01`, `20.01`, `-10`, `100`).
- Made sure `letter_spacing` parameter is typed `number` in the JSON schema,
  matching `offset`'s pattern.
- Result keys verified: spec calls out `old_letter_spacing` and
  `new_letter_spacing`.

No structural concerns — proceed to implement.
