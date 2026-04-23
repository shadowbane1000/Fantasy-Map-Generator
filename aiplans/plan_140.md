# Plan 140 — `set_label_text` AI tool

## Use case
Rewrite the text content of an existing SVG map label (e.g. a state label like `stateLabel3`, a burg label like `burgLabel5`, or a custom `addedLabels` entry like `label1234`). This is the same side-effect as opening the Labels Editor, typing into the "Label text" field, and letting the `changeText()` handler rebuild the inner `<tspan>` nodes.

The assistant uses the tool to rename on-map labels without touching underlying data domains. `set_map_name` renames the map-wide header (`#mapName` input); `set_label_text` renames a single on-map label (`#labels <text>` element).

## Label data model (confirmed)

Labels are DOM-only — there is no `pack.labels` array. Relevant files:

- `public/main.js:75` — `let labels = viewbox.append("g").attr("id", "labels");`
- `public/main.js:103-105` — three default child groups:
  - `#states` — state labels (`stateLabelN`), populated by `drawStateLabels()`.
  - `#addedLabels` — user-added labels (`labelN`), populated via `addLabelOnClick`.
  - `#burgLabels` — burg labels (`burgLabelN`), populated by `drawBurgLabels`.
  Other groups (e.g. `#countries`) can be created ad-hoc via `createNewGroup` in the labels editor.
- `public/modules/ui/labels-editor.js:309-321` — the editor's `changeText()` handler rewrites the `textPath` children when the user types in `#labelText`:

```js
function changeText() {
  const input = byId("labelText").value;
  const el = elSelected.select("textPath").node();
  const lines = input.split("|");
  if (lines.length > 1) {
    const top = (lines.length - 1) / -2;
    el.innerHTML = lines.map((line, index) =>
      `<tspan x="0" dy="${index ? 1 : top}em">${line}</tspan>`
    ).join("");
  } else el.innerHTML = `<tspan x="0">${lines}</tspan>`;
}
```

Each label is a `<text id="…">` element whose single child is a `<textPath xlink:href="#textPath_{id}">`, which wraps one or more `<tspan>` children. The pipe character `|` inside the editor's input separates multiple lines; we preserve that semantic.

`updateValues(textPath)` (line 88) reconstructs the current editor display by joining the tspans with `|` — that is the canonical "current text" representation. The tool mirrors the same rule: read + write via pipe-joined text.

## Label identification (confirmed)

The labels editor identifies a label by the **DOM id** of the `<text>` element (e.g. `stateLabel3`, `burgLabel5`, `label1234`). That id is what all other code uses to look the element up (`public/modules/ui/labels-editor.js:22,100,287,404,410,423`; `public/modules/ui/tools.js:232-278,614`). The tool accepts that id as its primary `label` parameter.

For convenience (and because the assistant frequently knows the on-map text, not the DOM id), the tool also accepts an exact pipe-joined text match across all `#labels text` elements — falling back to a scan if `getElementById(label)` misses. First match wins; ambiguity returns a structured error listing the candidate ids so the model can disambiguate.

## Tool contract

Inputs:
- `label` (required, string) — the `<text>` element's DOM id, OR its exact current pipe-joined text.
- `text` (required, string) — the new text. Trimmed; may embed `|` to force multi-line. Empty / whitespace-only rejected.

Success output:
```json
{
  "ok": true,
  "id": "label1234",
  "previousText": "Fantasy Map",
  "text": "My Realm"
}
```

Error conditions:
- `label` missing / non-string / empty → "`label` must be a non-empty string."
- `text` missing / non-string → "`text` must be a non-empty string." (empty rejected)
- `text` whitespace-only → rejected.
- No element found for `label` → "Label {label} not found."
- Multiple elements match the same text → "Multiple labels match text {…}: {ids}. Pass the DOM id instead."
- Found element but has no `textPath` child → "Label {id} has no textPath; cannot edit text."

## Runtime seam

```ts
export interface SetLabelTextRuntime {
  find: (label: string) => { id: string; currentText: string } | null | {
    error: "ambiguous";
    ids: string[];
  };
  apply: (id: string, text: string) => void;
}
```

`defaultRuntime`:
- `find(label)`:
  - Try `document.getElementById(label)`; if the result is a `<text>` element inside `#labels`, read its `textPath > tspan[]`, pipe-join to produce `currentText`, return `{id: element.id, currentText}`.
  - Otherwise, scan `#labels text` for a matching pipe-joined text content. If exactly one matches, return it. If >1 match, return `{error: "ambiguous", ids}`. If zero, return `null`.
- `apply(id, text)`:
  - Look up the `<text>` by id, select its `<textPath>` child, rebuild the tspans following the editor's exact rule (split on `|`, multi-line uses `dy="{offset}em"` and `x="0"`).
  - Throw if the element / textPath is missing (execute path already pre-validated, but defensive).

## Tests

Injected-runtime unit tests (fake `SetLabelTextRuntime`):
1. Renames an existing label by DOM id; returns `previousText` and new `text`.
2. Renames by current-text match.
3. Preserves pipe-split multi-line input (`"Ashen | Vale"`).
4. Rejects missing `label`.
5. Rejects missing / empty / whitespace-only `text`.
6. Not-found `label` → errorResult.
7. Ambiguous text match → errorResult mentioning all candidate ids.
8. Runtime `apply` throw → error surfaced.

Integration block (`defaultRuntime` against a JSDOM-built SVG fixture):
1. Reads and rewrites a single-line `<tspan>` label.
2. Reads and rewrites a multi-line `|`-joined label.
3. Finds by current text when id isn't known.

## Registration

Register in `src/ai/index.ts` alongside `setMapNameTool`. Export both `setLabelTextTool` and `createSetLabelTextTool` from the barrel.

## README row

Added near `set_map_name` (row immediately after):

| `set_label_text`        | Rewrite the text of a specific on-map label — state label (`stateLabel{i}`), burg label (`burgLabel{i}`), or custom label (`label{i}`). Same side-effect as typing in the Labels Editor's text field: splits on `\|` for multi-line, rebuilds the `<textPath>`'s inner tspans. Matches by DOM id or current pipe-joined text (first exact match; ambiguous text match errors with candidate ids). Does NOT rename the underlying state / burg data — use `rename_state` / `rename_burg` for that. | "Change the Fantasy Map label to 'Eldoria'", "Rename the stateLabel3 label to 'Ashmark \| Empire'" |
