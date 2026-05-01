# Plan 305 — `move_label` AI tool

## Lint baseline (before any changes)

`npm run lint` on `master @ ea93af2` (plan-305 branch base):

```
Checked 708 files in 546ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. The 7 warnings + 1 info come from pre-existing
`lint/performance/noDynamicNamespaceImportAccess` notices in
`src/renderers/draw-heightmap.ts` (lines 34 and 64). They are not in any
file we will touch. This is the baseline that the post-implementation
lint must match.

## Use case

The Edit Label dialog in `public/modules/ui/labels-editor.js` makes
each `<text>` draggable via:

```js
function dragLabel() {
  const tr = parseTransform(elSelected.attr("transform"));
  const dx = +tr[0] - d3.event.x,
    dy = +tr[1] - d3.event.y;
  d3.event.on("drag", function () {
    const x = d3.event.x, y = d3.event.y;
    const transform = `translate(${dx + x},${dy + y})`;
    elSelected.attr("transform", transform);
    debug.select("#controlPoints").attr("transform", transform);
  });
}
```

The end state after a drag is `transform="translate(<x>,<y>)"` on the
`<text>` element. The path geometry (the `<textPath>`'s `d` attribute)
stays put — only the `<text>`'s transform moves the rendered glyphs.

The AI has no equivalent today. This plan adds `move_label`, the labels
analogue of `move_burg` / `move_marker`.

### Absolute, not delta — design choice

Inputs `x` and `y` are **absolute** translate values in map-space
coordinates (the same coordinate system used by `find_cell_at_coords`,
`move_burg`, etc.). The legacy drag handler computes a new absolute
position from cumulative drag motion; for the AI tool the simplest
contract is "place the label at this point".

If a caller wants to nudge a label by an offset, they can read the
existing translate via `move_label`'s return value (it includes
`old_x` / `old_y`), or use a future `get_label_info` tool. Today there
is no such read-only tool, so the documented workflow is "call
`move_label` with the new absolute coords; the response tells you
where it used to be". This limitation is recorded in the tool's
description.

## Tool name

`move_label`

## Inputs

- `label_id` (string, required) — the `id` attribute of the `<text>`
  element to move. Same lookup convention as `set_label_size` /
  `remove_label`: must be a `<text>` whose direct parent is a `<g>`
  directly under `#labels`.
- `x` (number, required) — new x translate, finite number.
- `y` (number, required) — new y translate, finite number.

(No range clamping — labels can validly move anywhere in the map's
coordinate space, and the renderer will draw them wherever, even
off-canvas.)

## Behavior

1. Validate `label_id` is a non-empty trimmed string. Otherwise → error.
2. Validate `x` is a finite number. Otherwise → error.
3. Validate `y` is a finite number. Otherwise → error.
4. Resolve the `<text>` element via `runtime.findLabel`, reusing the
   discriminated-union `LabelLookup` from `set-label-group.ts`. Errors
   on `not_found`, `outside_labels`, `unexpected_parent`,
   `labels_root_missing`.
5. Read the current `transform` attribute via `runtime.getTransform`.
   Parse with the regex
   `/translate\(\s*([-\d.eE+]+)\s*[,\s]\s*([-\d.eE+]+)\s*\)/`.
   - On success: `old_x`, `old_y` are the parsed numbers.
   - On no-match (attribute missing, garbage, `rotate(45)`, etc.):
     both null. The new translate is still applied (no-transform is
     treated as origin 0,0 conceptually, but we report null rather
     than 0 so callers can detect "no prior value").
6. Write `transform="translate(<x>,<y>)"` on the `<text>` via
   `runtime.setTransform`. The `<textPath>` `d` attribute is NOT
   touched.
7. Return ok with `{ ok: true, label_id, old_x, old_y, new_x, new_y }`.

## Inputs/Outputs

```
input_schema:
{
  type: "object",
  properties: {
    label_id: { type: "string", description: "..." },
    x: { type: "number", description: "..." },
    y: { type: "number", description: "..." }
  },
  required: ["label_id", "x", "y"]
}
```

Successful response (JSON content, `isError` falsy):
```
{
  "ok": true,
  "label_id": "<id>",
  "old_x": <number or null>,
  "old_y": <number or null>,
  "new_x": <number>,
  "new_y": <number>
}
```

## Validation / error catalog

- `label_id` not a string OR empty after trim → "label_id must be a non-empty string."
- `x` not a finite number → "x must be a finite number."
- `y` not a finite number → "y must be a finite number."
- `findLabel` returns:
  - `labels_root_missing` → "#labels SVG element not found."
  - `not_found` → "No label found with id <id>."
  - `outside_labels` → "Label <id> not found under #labels."
  - `unexpected_parent` → "Label <id> has unexpected parent."
- `setTransform` throws → surface message.

## Files to add

- `src/ai/tools/move-label.ts` — tool implementation.
- `src/ai/tools/move-label.test.ts` — Vitest unit and DOM-mock
  integration tests.

## Files to edit

- `src/ai/index.ts`:
  - Add `import { moveLabelTool } from "./tools/move-label";` next to
    `moveBurgTool` / `moveMarkerTool` imports.
  - Add a corresponding
    `export { createMoveLabelTool, moveLabelTool } from "./tools/move-label";`
    block near the existing `move-burg` / `move-marker` export blocks.
  - Add `registry.register(moveLabelTool);` adjacent to
    `registry.register(moveBurgTool);`.

## Runtime-injection seam

```ts
import type { LabelLookup } from "./set-label-group";

export interface MoveLabelRuntime {
  findLabel(labelId: string): LabelLookup;
  getTransform(textEl: Element): string | null;
  setTransform(textEl: Element, value: string): void;
}

export const defaultMoveLabelRuntime: MoveLabelRuntime = { ... };
export function createMoveLabelTool(runtime?: MoveLabelRuntime): Tool { ... }
export const moveLabelTool = createMoveLabelTool();
```

`findLabel` is implemented locally (mirroring `set-label-size.ts`'s
copy) using the same `resolveLabelsRoot` + `classifyFoundElement`
pattern. `getTransform` defaults to `textEl.getAttribute("transform")`.
`setTransform` defaults to `textEl.setAttribute("transform", value)`.

The translate-parsing regex
`/translate\(\s*([-\d.eE+]+)\s*[,\s]\s*([-\d.eE+]+)\s*\)/`
handles:
- comma-separated: `translate(100,200)` → `(100, 200)`
- space-separated: `translate(100 200)` → `(100, 200)`
- whitespace-padded: `translate( 100 , 200 )` → `(100, 200)`
- scientific notation: `translate(-1.5e2,3.7E1)` → `(-150, 37)`
- garbage / no match: `translate(foo)`, `rotate(45)` → `(null, null)`

We use `parseFloat` on the captured groups; values that don't parse to
a finite number become null.

## Tests

Mocked-runtime tests (Vitest):
- Happy path: `<text>` had `transform="translate(100,200)"` → x=300,
  y=400 → `setTransform` called with `("translate(300,400)")`; result
  reports `old_x=100, old_y=200, new_x=300, new_y=400`.
- Existing transform missing (`getTransform` returns null) →
  `old_x: null, old_y: null`; new still applied.
- Existing transform with whitespace variations: `"translate(100 200)"`,
  `"translate( 100 , 200 )"`, `"translate(-1.5e2,3.7E1)"` — all
  parsed correctly.
- Existing transform garbage: `"translate(foo)"` → both null;
  new still applied.
- Existing unrelated transform: `"rotate(45)"` → both null;
  new still applied.
- Negative coordinates accepted: `x=-1000, y=-500`.
- Non-integer coordinates accepted: `x=1.5, y=2.7`.
- `x` NaN / ±Infinity / non-number → error. No `setTransform` call.
- `y` NaN / ±Infinity / non-number → error. No `setTransform` call.
- Missing `label_id` → error. No `findLabel` call.
- Missing `x` or `y` → error.
- `findLabel` not_found / outside_labels / unexpected_parent /
  labels_root_missing → respective error messages.
- `setTransform` throwing surfaces as error.
- Tool name `move_label` and `ToolRegistry` round-trip.

Default-runtime DOM integration tests:
- Stub `document.getElementById` with a fake DOM containing
  `#labels > g.addedLabels > text#addedLabel_42 > textPath[d="M0,0..."]`.
  Set initial `text` transform `"translate(100,200)"`.
- Happy path: call `move_label` with x=300, y=400; `<text>`'s
  transform becomes `"translate(300,400)"`; `<textPath>`'s `d` is
  unchanged.
- Verify `<textPath>` `d` is NOT modified (regression for "only the
  <text> moves").
- Unknown label_id → error.
- Label outside `#labels` → error.
- Both `window.labels` and `#labels` missing → error.

## Self-review checklist

- [x] use case mirrors the editor's `dragLabel` end state — write
  `translate(x, y)` on the `<text>` only, never the textPath's `d`.
- [x] absolute-coordinate semantics documented in description.
- [x] runtime seam exposes the three mockable DOM boundaries
  (`findLabel`, `getTransform`, `setTransform`).
- [x] error messages cover every failure mode listed in the prompt.
- [x] only adds the two new files and edits `src/ai/index.ts`.
- [x] tests cover happy paths, every parse variant, every validation
  error, the `<textPath>` non-mutation regression, and the registry
  round-trip.

### Self-review notes (post-edit pass)

Re-read after writing:
- `old_x` and `old_y` are reported separately as numbers OR null. We
  do NOT collapse them into a single nullable tuple — symmetric to
  `move_burg`'s `previousX`/`previousY`.
- The translate regex captures `[-\d.eE+]+` (digits, dot, sign,
  exponent markers). It is intentionally permissive — anything that
  passes `parseFloat` to a finite number is accepted. Tokens like
  `1.2.3` will still yield a finite parseFloat (`1.2`) but the regex
  itself accepts them; we treat them as parse-success since the legacy
  editor's `parseTransform` is similarly permissive.
- We do NOT call `parseFloat` on the captured groups twice. We call
  it once and check `Number.isFinite`. If either group fails, both
  become null (we want "either both parsed or both unknown" rather
  than half-parsed).
- We use `JSON.stringify(labelId)` in the user-visible error messages
  (matching `set-label-size.ts` / `set-label-group.ts`) so quoted ids
  are unambiguous.
- The output `transform` string format matches the legacy editor
  exactly: `translate(<x>,<y>)` with no space after the comma. Tests
  assert the exact string.
