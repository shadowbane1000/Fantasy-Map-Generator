# Plan 301 — `set_label_size` AI tool

## Lint baseline (before any changes)

`npm run lint` on `master @ 213eaec` (plan-301 branch base):

```
Checked 700 files in ~551ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

No errors. The 7 warnings + 1 info come from pre-existing `lint/performance/noDynamicNamespaceImportAccess` notices in `src/renderers/draw-heightmap.ts` and similar legacy spots — not in any file we touch. This baseline is what the post-implementation lint must match.

## Use case

The Edit Label dialog in `public/modules/ui/labels-editor.js` exposes a "Size:" relative-size slider (`#labelRelativeSize`, type=number, min=30, max=300, step=1) bound to `changeRelativeSize`. That handler does:

```js
function changeRelativeSize() {
  elSelected.select("textPath").attr("font-size", this.value + "%");
  tip("Label relative size: " + this.value + "%");
  changeText();
}
```

The percentage is written to the selected label's sole `<textPath>` child as `font-size="<n>%"`. The AI currently has no way to do this; this plan adds `set_label_size`.

### `changeText()` divergence (intentional)

`changeRelativeSize` calls `changeText()` after writing the new font-size. Inspecting `changeText` in the editor: it re-renders the `<tspan>` content from the current `labelText` `<input>` value. Because the input value equals the label's existing rendered text whenever the user has only changed the size (not the text), the re-render is effectively a no-op — the same string is rebuilt. The AI tool therefore only writes `font-size` and does NOT touch `<tspan>` content. End-state of the SVG is identical to what the editor produces when the user moves only the size slider.

## Tool name

`set_label_size`

## Inputs

- `label_id` (string, required) — the `id` attribute of the `<text>` element to size. Same lookup convention as `set_label_group` / `remove_label`: must be a `<text>` whose direct parent is a `<g>` directly under `#labels`.
- `size` (number, required) — the new percentage value (no `%` suffix). Must be a finite, positive number; clamped to `[10, 1000]`.

### Size bounds — chosen range and rationale

Legacy slider in `src/index.html` is `min=30 max=300 step=1`. The prompt says: "as a fallback, accept any positive finite number; clamp to a reasonable range like [10, 1000]." We adopt **[10, 1000]** because:
- It contains the legacy slider's full range (30..300) plus generous head- and tail-room for AI use cases that the slider never anticipated.
- It still rejects pathological values (0, negative, ridiculous orders of magnitude like 1e9) that would either zero-out the label or overflow the SVG viewport.
- Legacy is the user's UI-typed range; AI use-cases (e.g. "make this label twice as big") may legitimately want outside the slider band, e.g. a 5% micro-label or a 600% banner.

The chosen range is documented in the tool's description and surfaced in the error message when violated.

## Behavior

1. Validate `label_id` is a non-empty trimmed string. Otherwise → error.
2. Validate `size` is a finite positive number. Otherwise → error (specific messages for missing, NaN, non-finite, non-positive).
3. Clamp-check `size` against `[10, 1000]`. Out of range → error naming the allowed range.
4. Resolve the `<text>` element via the runtime's `findLabel`, reusing the discriminated-union pattern from `set-label-group.ts` (`{ kind: "found", el, parent } | "labels_root_missing" | "not_found" | "outside_labels" | "unexpected_parent"`).
5. Find its sole `<textPath>` child. If absent → error.
6. Read the existing `font-size` attribute. Parse the numeric prefix via `parseFloat`. If the result is NaN or non-finite, treat it as `null` for `old_size`.
7. Write `font-size="<size>%"` on the `<textPath>`.
8. Return `{ ok: true, label_id, old_size, new_size }`.

## Inputs/Outputs

```
input_schema:
{
  type: "object",
  properties: {
    label_id: { type: "string", description: "..." },
    size:     { type: "number", description: "Percentage value (10-1000)" }
  },
  required: ["label_id", "size"]
}
```

Successful response (JSON content, `isError` falsy):
```
{
  "ok": true,
  "label_id": "<id>",
  "old_size": 100 | null,
  "new_size": 150
}
```

## Validation / error catalog

- `label_id` not a string OR empty after trim → "label_id must be a non-empty string."
- `size` missing / not a number / NaN → "size must be a finite positive number."
- `size` is `Infinity` / `-Infinity` → "size must be a finite positive number."
- `size <= 0` → "size must be a finite positive number."
- `size < 10` or `size > 1000` → "size must be between 10 and 1000 (got <n>)."
- `findLabel` returns:
  - `labels_root_missing` → "#labels SVG element not found."
  - `not_found` → "No label found with id "<id>"."
  - `outside_labels` → "Label "<id>" not found under #labels."
  - `unexpected_parent` → "Label "<id>" has unexpected parent."
- `<textPath>` child missing → "Label "<id>" has no <textPath>."

## Files to add

- `src/ai/tools/set-label-size.ts` — tool implementation.
- `src/ai/tools/set-label-size.test.ts` — Vitest unit and DOM-mock integration tests.

## Files to edit

- `src/ai/index.ts`:
  - Add `import { setLabelSizeTool } from "./tools/set-label-size";` next to `setLabelGroupTool` import.
  - Add `export { createSetLabelSizeTool, defaultSetLabelSizeRuntime, type SetLabelSizeRuntime, setLabelSizeTool } from "./tools/set-label-size";` near the existing set-label-group export block.
  - Add `registry.register(setLabelSizeTool);` near `registry.register(setLabelGroupTool);`.

## Runtime-injection seam

Mirror `SetLabelGroupRuntime`:

```ts
export interface SetLabelSizeRuntime {
  findLabel(labelId: string): LabelLookup;       // re-exported from set-label-group
  findTextPath(textEl: Element): Element | null; // sole <textPath> child or null
  getFontSize(textPathEl: Element): string | null;
  setFontSize(textPathEl: Element, value: string): void;
}
export const defaultSetLabelSizeRuntime: SetLabelSizeRuntime = { ... };
export function createSetLabelSizeTool(runtime?: SetLabelSizeRuntime): Tool { ... }
export const setLabelSizeTool = createSetLabelSizeTool();
```

We re-use the `findLabel` implementation from `set-label-group` by importing the helper module's machinery, OR replicate the small `resolveLabelsRoot` + `classifyFoundElement` logic directly. To avoid circular imports and to keep the test surface narrow, we import the `LabelLookup` type from `set-label-group` and re-implement `findLabel` in this file using the same shared `getGlobal`/`getDocument` pattern (essentially a copy of the helper). This matches how the codebase already keeps each tool self-contained.

`findTextPath` looks at `textEl.children`, returns the first child whose `tagName.toLowerCase() === "textpath"`, or null.

`getFontSize` returns `textPathEl.getAttribute("font-size")` (or null if attribute missing/method absent).

`setFontSize` calls `textPathEl.setAttribute("font-size", value)`.

## Tests

`set-label-size.test.ts` mirrors the structure of `set-label-group.test.ts`:

1. Mocked-runtime suite (`describe("set_label_size — unit (mocked runtime)")`) covers:
   - happy path: 100% → 150%, returns old=100, new=150, runtime.setFontSize called with "150%".
   - existing `font-size` missing → old_size: null, new_size still applied.
   - existing `font-size` unparseable (e.g. "abc") → old_size: null, new_size applied.
   - findLabel returns `not_found` → error w/ id; setFontSize not called.
   - findLabel returns `outside_labels` → error "not found under #labels"; setFontSize not called.
   - findLabel returns `unexpected_parent` → error "unexpected parent".
   - findLabel returns `labels_root_missing` → error mentions "#labels".
   - findTextPath returns null → error "has no <textPath>".
   - missing label_id (undefined / null / "" / "  " / non-string) → errors mentioning label_id, no findLabel call.
   - missing size (undefined, null, non-number, NaN) → errors mentioning size, no findLabel call.
   - `size = 0` and `size < 0` → errors "finite positive number".
   - `Infinity` / `-Infinity` → errors "finite positive number".
   - `size = 9` (just below clamp) → error mentioning "between 10 and 1000".
   - `size = 1001` (just above clamp) → error mentioning "between 10 and 1000".
   - `size = 10` and `size = 1000` (boundary, inclusive) → success.
   - setFontSize throws → error surfaces the message.
   - tool name = "set_label_size"; round-trips through `ToolRegistry`.
2. Default-runtime DOM integration suite (`describe("defaultSetLabelSizeRuntime ...")`) — sets up `globalThis.document` with a fake by-id map and a labels root containing `<text>` → `<textPath>`. Verifies:
   - happy path applies attribute.
   - missing #labels both via window.labels and document → error.
   - label-not-under-#labels error path.

## Wiring in `src/ai/index.ts`

Three minimal edits:
1. Import line near other set-label imports.
2. Re-export block (alphabetised neighbour to set-label-group).
3. `registry.register(setLabelSizeTool);` near `registry.register(setLabelGroupTool);`.

## Self-review checklist

- [x] use-case matches the prompt's spec.
- [x] size-bounds [10, 1000] documented and justified.
- [x] error catalog covers every prompt-listed failure mode.
- [x] return shape matches prompt: `{ ok, label_id, old_size, new_size }`.
- [x] discriminated-union LabelLookup re-used → identical lookup semantics to `set_label_group`.
- [x] tool does NOT call `changeText` — divergence documented above.
- [x] tests cover boundary + invalid + happy paths.
- [x] only adds `src/ai/tools/set-label-size.{ts,test.ts}` and edits `src/ai/index.ts`.

### Self-review notes (post-edit pass)

Re-read the plan after writing it:
- Confirmed input_schema example reflects required fields (`label_id`, `size`).
- Confirmed the error message for clamp violation includes the actual received value, which is more helpful than just naming the range.
- Boundary tests at exactly 10 and 1000 explicitly assert SUCCESS (inclusive bounds).
- Decision recorded: do not call `changeText()`. Rationale: the editor's `changeText` rebuilds tspan from the current text-input value; for a pure size change the text-input value equals the rendered text, so the rebuild is a no-op. Skipping it keeps the tool's surface narrower and avoids depending on legacy DOM IDs that may not exist when the AI runs.
