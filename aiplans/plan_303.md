# Plan 303 — `regenerate_label_name` AI tool

## Lint baseline (before any changes)

`npm run lint` on `master @ d8a2f88` (plan-303 branch base):

```
Checked 704 files in 546ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. The 7 warnings + 1 info come from pre-existing
`lint/performance/noDynamicNamespaceImportAccess` notices in
`src/renderers/draw-heightmap.ts` (lines 34 and 64). They are not in any
file we will touch. This is the baseline that the post-implementation
lint must match.

## Use case

The Edit Label dialog in `public/modules/ui/labels-editor.js` exposes a
"Random" button next to the text input. Its handler is:

```js
function generateRandomName() {
  let name = "";
  if (elSelected.attr("id").slice(0, 10) === "stateLabel") {
    const id = +elSelected.attr("id").slice(10);
    const culture = pack.states[id].culture;
    name = Names.getState(Names.getCulture(culture, 4, 7, ""), culture);
  } else {
    const box = elSelected.node().getBBox();
    const cell = findCell((box.x + box.width) / 2, (box.y + box.height) / 2);
    const culture = pack.cells.culture[cell];
    name = Names.getCulture(culture);
  }
  byId("labelText").value = name;
  changeText();
}
```

`changeText()` then rebuilds the `<tspan>` content of the label's
`<textPath>` from the `<input>` value:

```js
function changeText() {
  const input = byId("labelText").value;
  const el = elSelected.select("textPath").node();
  const lines = input.split("|");
  if (lines.length > 1) {
    const top = (lines.length - 1) / -2;
    el.innerHTML = lines.map((line, index) => `<tspan x="0" dy="${index ? 1 : top}em">${line}</tspan>`).join("");
  } else el.innerHTML = `<tspan x="0">${lines}</tspan>`;
  if (elSelected.attr("id").slice(0, 10) === "stateLabel")
    tip("Use States Editor to change an actual state name, not just a label", false, "warning");
}
```

The AI has no equivalent today. This plan adds `regenerate_label_name`,
the labels analogue of plan 292's `regenerate_lake_name` but with a
state-vs-other branch.

### Legacy quirk we must mirror — `(box.x + box.width) / 2`

`generateRandomName()`'s non-state branch computes the cell to look up
the culture from with:

```js
const cell = findCell((box.x + box.width) / 2, (box.y + box.height) / 2);
```

The X expression `(box.x + box.width) / 2` is **not** the bbox centroid
(`box.x + box.width / 2`). It is the average of `x` and `width` —
arithmetically meaningless because it mixes a coordinate with a length.
This appears to be a long-standing bug in the legacy editor, but the AI
tool's contract is "match what the editor produces", so we mirror the
exact arithmetic. We do NOT silently fix it. The Y expression is the
same form; for Y it happens to be correct only when `box.y === 0`.

We document this quirk in the tool's description and as a code comment
in the implementation.

## Tool name

`regenerate_label_name`

## Inputs

- `label_id` (string, required) — the `id` attribute of the `<text>`
  element to re-roll. Same lookup convention as `set_label_size` /
  `remove_label`: must be a `<text>` whose direct parent is a `<g>`
  directly under `#labels`.

## Behavior

1. Validate `label_id` is a non-empty trimmed string. Otherwise → error.
2. Resolve the `<text>` element via `runtime.findLabel`, reusing the
   discriminated-union `LabelLookup` from `set-label-group.ts`. Errors
   on `not_found`, `outside_labels`, `unexpected_parent`,
   `labels_root_missing`.
3. Find its sole `<textPath>` child via `runtime.getTextpath`. If
   absent → error.
4. Read the current text by joining the `<tspan>` text content children
   with `"|"`. If the `<textPath>` has no `<tspan>` children, fall back
   to `textPath.textContent`. If unparseable → `null`.
5. Branch on the label id:
   - `label_id.startsWith("stateLabel")` → **state branch**:
     - Parse the suffix `+label_id.slice(10)`. If not a non-negative
       finite integer → error.
     - Read `pack.states[stateId].culture` via
       `runtime.getStateCulture(stateId)`. Errors propagate.
     - Generate via `runtime.generateStateName(culture)`.
     - Set `kind = "state"` and `note = "This is just a label. Use
       rename_state to change the state's actual name."`.
   - Otherwise → **other branch**:
     - Read the bbox via `runtime.getBBox(textEl)`. Compute the cell
       coordinates **as the legacy editor does**, including the quirky
       X arithmetic: `x = (box.x + box.width) / 2`,
       `y = (box.y + box.height) / 2`.
     - `cell = runtime.findCell(x, y)`. If `cell` is not a finite
       integer ≥ 0 → error.
     - `culture = runtime.getCellCulture(cell)`. Errors propagate.
     - Generate via `runtime.generateCultureName(culture)`.
     - Set `kind = "other"`. No `note`.
6. Validate generator output is a non-empty string (after trim).
   Otherwise → error; tspan unchanged.
7. Rebuild the `<textPath>` content using the same logic as
   `changeText()`:
   - If the trimmed name contains `|`, split on `|`, then build the
     multi-line tspans:
     `top = (lines.length - 1) / -2;`
     `lines.map((line, idx) => '<tspan x="0" dy="' + (idx ? 1 : top) + 'em">' + line + '</tspan>').join('')`
   - Otherwise: `'<tspan x="0">' + name + '</tspan>'`
   The result is written via `runtime.setTextpathContent(textPath, html)`,
   which by default does `textPath.innerHTML = html` (matching the
   legacy editor — accepted in similar previously merged tools).
8. Return ok with `{ ok: true, label_id, kind, old_text, new_text, note? }`.

## Inputs/Outputs

```
input_schema:
{
  type: "object",
  properties: {
    label_id: { type: "string", description: "..." }
  },
  required: ["label_id"]
}
```

Successful response (JSON content, `isError` falsy):
```
{
  "ok": true,
  "label_id": "<id>",
  "kind": "state" | "other",
  "old_text": "<previous text or null>",
  "new_text": "<generated name>",
  "note": "..."   // only when kind === "state"
}
```

## Validation / error catalog

- `label_id` not a string OR empty after trim → "label_id must be a non-empty string."
- `findLabel` returns:
  - `labels_root_missing` → "#labels SVG element not found."
  - `not_found` → "No label found with id <id>."
  - `outside_labels` → "Label <id> not found under #labels."
  - `unexpected_parent` → "Label <id> has unexpected parent."
- `<textPath>` child missing → "Label <id> has no <textPath>."
- State branch:
  - id-suffix not parseable to a non-negative integer →
    "stateLabel id must be followed by a non-negative integer (got <suffix>)."
  - `getStateCulture` throws → surface message.
  - missing `pack.states` / missing state / missing `.culture` →
    descriptive errors from default runtime.
- Other branch:
  - `getBBox` throws (e.g. element not laid out) → surface message.
  - `findCell` not available (default runtime) → "findCell is not available; the map hasn't finished loading."
  - `findCell` returns non-integer / negative → "findCell did not return a valid cell index for (x, y)."
  - `pack.cells` / `pack.cells.culture` missing → descriptive error.
  - `getCellCulture` returns undefined → descriptive error.
- `generateStateName` / `generateCultureName` throws → surface message.
- Generator output empty/whitespace/non-string →
  "Name generator returned an empty/invalid name."
- Default-runtime missing dependency:
  - `Names.getCulture` not available → "Names.getCulture is not available."
  - `Names.getState` not available → "Names.getState is not available."

## Files to add

- `src/ai/tools/regenerate-label-name.ts` — tool implementation.
- `src/ai/tools/regenerate-label-name.test.ts` — Vitest unit and
  DOM-mock integration tests.

## Files to edit

- `src/ai/index.ts`:
  - Add `import { regenerateLabelNameTool } from "./tools/regenerate-label-name";`
    next to `regenerateLakeNameTool` import.
  - Add a corresponding `export { ... regenerateLabelNameTool }` block
    near the existing regenerate-lake-name export block.
  - Add `registry.register(regenerateLabelNameTool);` adjacent to the
    `registry.register(regenerateLakeNameTool);` line.

## Runtime-injection seam

```ts
import type { LabelLookup } from "./set-label-group";

export interface RegenerateLabelNameRuntime {
  findLabel(labelId: string): LabelLookup;
  getTextpath(textEl: Element): Element | null;
  getBBox(textEl: Element): { x: number; y: number; width: number; height: number };
  findCell(x: number, y: number): number;
  getStateCulture(stateId: number): number;
  getCellCulture(cellIndex: number): number;
  generateStateName(culture: number): string;
  generateCultureName(culture: number): string;
  setTextpathContent(textPathEl: Element, html: string): void;
}

export const defaultRegenerateLabelNameRuntime: RegenerateLabelNameRuntime = { ... };
export function createRegenerateLabelNameTool(runtime?: RegenerateLabelNameRuntime): Tool { ... }
export const regenerateLabelNameTool = createRegenerateLabelNameTool();
```

`findLabel` is implemented locally (mirroring `set-label-size.ts`'s
copy) using the same `resolveLabelsRoot` + `classifyFoundElement`
pattern. `getTextpath` returns the first child whose
`tagName.toLowerCase() === "textpath"`.

`getBBox` defaults to `(el as SVGGraphicsElement).getBBox()` and
forwards thrown errors. The default runtime guards `findCell` /
`Names.getCulture` / `Names.getState` access via `getGlobal` and emits
clear "X is not available" errors when missing.

## Tests

Mocked-runtime tests:
- Happy path: `stateLabel3` → state's culture → `generateStateName`
  returns name → `<textPath>` gets new tspan; result: `kind: "state"`,
  old/new text, `note` set.
- Happy path: `addedLabel_5` → bbox → findCell → cell's culture →
  `generateCultureName` → tspan updated; `kind: "other"`, no note.
- Multi-line name `"Foo|Bar"`: produces 2 tspans with the multi-line
  dy logic; old_text round-trips a multi-line previous value.
- State label suffix not an integer (`stateLabelfoo`) → error.
- State label whose `pack.states[id]` is missing → error (via runtime).
- State label whose state has no `.culture` → error (via runtime).
- Other label: `findCell` returns -1 / NaN / non-finite → error.
- Other label: `getCellCulture` throws or returns undefined → error.
- Generator throws → error; tspan unchanged.
- Generator returns empty / whitespace / non-string → error;
  tspan unchanged.
- `<textPath>` child missing → error.
- `findLabel` not_found / outside_labels / unexpected_parent /
  labels_root_missing → respective error messages.
- `label_id` not a non-empty string → error; no findLabel call.
- Tool name + `ToolRegistry` round-trip.
- Bbox-quirk regression: when `box = {x: 10, width: 200, y: 0, height: 50}`,
  `findCell` is invoked with `(105, 25)` — confirming the legacy
  arithmetic (105 = (10 + 200) / 2, NOT 110 = 10 + 200/2).

Default-runtime DOM integration tests:
- State branch: stub `window.pack.states`, `window.Names`, and a fake
  `document` with the labels root + `<text id="stateLabel0">` + tspan;
  end-to-end works.
- Other branch: stub `window.pack.cells`, `window.findCell`,
  `window.Names`, and a fake `document`; end-to-end works.
- Default runtime: each missing dep yields a clear error mentioning
  the dependency name (`pack`, `pack.states`, `pack.cells`,
  `pack.cells.culture`, `Names`, `Names.getCulture`, `Names.getState`,
  `findCell`).
- Both `#labels` and `window.labels` missing → error.

## Self-review checklist

- [x] use case mirrors the editor's `generateRandomName` + `changeText`
  exactly (including the bbox X-arithmetic quirk).
- [x] state vs. other branch decided by the same `id.startsWith("stateLabel")`
  test the editor uses (we use `startsWith` rather than `slice(0,10) === "stateLabel"`
  — equivalent for non-empty ids).
- [x] returns the editor's tip text only as a `note` field on state-branch
  results — never auto-shows it.
- [x] error messages cover every failure mode listed in the prompt.
- [x] runtime seam exposes every mockable boundary (DOM, pack reads,
  generator calls).
- [x] only adds the two new files and edits `src/ai/index.ts`.
- [x] tests cover happy paths, both branches, the bbox quirk, every
  validation error, missing-dep cases on the default runtime, and the
  registry round-trip.

### Self-review notes (post-edit pass)

Re-read after writing:
- `note` field is only present for state-branch successes (omitted, not
  null, on the other branch). Tests assert this with `not.toHaveProperty`
  / `toHaveProperty`.
- `old_text` is computed BEFORE writing the new tspans so that the
  round-trip in tests can be deterministic. Logic: if the textPath has
  any tspan children, join their textContent values with `"|"`; else
  fall back to `textPath.textContent`; else null.
- The bbox quirk is documented in code via inline comment and in the
  tool description, so future readers don't "fix" it and silently
  diverge from the editor.
- We use `JSON.stringify(labelId)` in the user-visible error messages
  (matching `set-label-size.ts` / `set-label-group.ts`) so quoted ids
  are unambiguous.
