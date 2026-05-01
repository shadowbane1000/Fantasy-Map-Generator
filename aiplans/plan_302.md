# Plan 302 — `set_label_offset` AI tool

## Use case

The Edit Label dialog has an "Offset" slider that controls where along its
path a `<textPath>`-rendered label starts: `<textPath startOffset="50%">`.
Dragging the slider in `labels-editor.js` calls
`changeStartOffset` / `changeStartOffsetFromValue`, which reduce to a single
DOM write:

```js
elSelected.select("textPath").attr("startOffset", value + "%");
```

The AI chat currently has no equivalent. Plan 302 adds a `set_label_offset`
tool that performs the same DOM mutation programmatically.

## Lint baseline (pre-change)

Captured with `npm run lint`:

```
Checked 704 files in 541ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

(7 warnings, 1 info — must not regress.)

## Range rationale

The slider definition in `src/index.html` (lines ~2765-2785) confirms:

```html
<input id="labelStartOffset" type="range" min="20" max="80" />
<input id="labelStartOffsetValue" type="number" min="20" max="80" step="1" />
```

Both the range and the numeric input cap at `[20, 80]`. The numeric handler
explicitly clamps with `Math.min(80, Math.max(20, this.value))`. There is
no UI affordance for offsets outside this band, so the AI tool adopts the
same `[20, 80]` inclusive window. This is a deliberate departure from the
wider clamp adopted by `set_label_size` ([10, 1000] vs the slider's
30..300): for offsets, exceeding 0..100 is meaningless to the SVG renderer
and the legacy editor's clamp matches what humans actually see when reading
back the value, so we adopt it verbatim.

## Behavior

1. Validate `label_id` (non-empty string).
2. Validate `offset` is a finite number in `[20, 80]` (inclusive).
3. Resolve `#labels` via the same `resolveLabelsRoot` strategy used by
   `set-label-size` (prefer `window.labels.node()`, fall back to
   `document.getElementById("labels")`).
4. Find a `<text id={label_id}>` whose direct parent is a `<g>` directly
   under `#labels`. Reuse the `LabelLookup` discriminated union from
   `set-label-group.ts` (imported via the type re-export).
5. Find the sole `<textPath>` child of the `<text>` element.
6. Read its current `startOffset` attribute, parse with `parseFloat`. NaN →
   `null`.
7. Write `setAttribute("startOffset", `${offset}%`)` (no namespace, matches
   the legacy `attr("startOffset", …)` call).
8. Return `okResult` with `{ ok: true, label_id, old_offset, new_offset }`.

## Input schema

```ts
{
  label_id: string;   // exact id on a <text> under #labels
  offset:   number;   // percentage WITHOUT the % suffix; [20, 80]
}
```

## Validation rules / error cases

| Condition | Error message |
| --- | --- |
| `label_id` missing / empty / non-string | `label_id must be a non-empty string.` |
| `offset` not a number | `offset must be a finite number.` |
| `offset` NaN / Infinity / -Infinity | `offset must be a finite number.` |
| `offset` < 20 or > 80 | `offset must be between 20 and 80 (got X).` |
| `#labels` & `window.labels` both missing | `#labels SVG element not found.` |
| label not found at all | `No label found with id "X".` |
| label found outside `#labels` | `Label "X" not found under #labels.` |
| label parent is not a `<g>` directly under `#labels` | `Label "X" has unexpected parent.` |
| `<text>` has no `<textPath>` child | `Label "X" has no <textPath>.` |
| `setAttribute` throws | error message from the exception |

## Files to add

- `src/ai/tools/set-label-offset.ts` — direct analogue of
  `set-label-size.ts`. Substitute `font-size` → `startOffset`, range
  [10, 1000] → [20, 80], type names from `Size` → `Offset`. Reuse
  `LabelLookup` import from `./set-label-group`. Same
  `resolveLabelsRoot` / `classifyFoundElement` helpers. Same Runtime
  injection seam pattern: `SetLabelOffsetRuntime`,
  `defaultSetLabelOffsetRuntime`, `createSetLabelOffsetTool`,
  exported `setLabelOffsetTool`.
- `src/ai/tools/set-label-offset.test.ts` — direct analogue of
  `set-label-size.test.ts`. Cases listed below.

## Wiring

`src/ai/index.ts` — add three things, alphabetically next to
`setLabelSize`:

1. Import: `import { setLabelOffsetTool } from "./tools/set-label-offset";`
2. Re-export block:
   ```ts
   export {
     createSetLabelOffsetTool,
     defaultSetLabelOffsetRuntime,
     type SetLabelOffsetRuntime,
     setLabelOffsetTool,
   } from "./tools/set-label-offset";
   ```
3. `registry.register(setLabelOffsetTool);` near
   `registry.register(setLabelSizeTool);`.

## Test coverage (Vitest)

- Happy path: `startOffset="50%"` → offset=70 → attribute becomes
  `"70%"`; `old_offset: 50, new_offset: 70`.
- `getStartOffset` returns `null` (attribute missing) → `old_offset: null`,
  attribute still written.
- `getStartOffset` returns `"abc"` (unparseable) → `old_offset: null`.
- `getStartOffset` returns `"40px"` → `old_offset: 40` (parseFloat strip).
- Boundary 20 inclusive — success, attribute `"20%"`.
- Boundary 80 inclusive — success, attribute `"80%"`.
- Out of range: 19, 81, 100, 0, -10 — error names `[20, 80]`.
- NaN / Infinity / -Infinity / non-number — error mentions "finite number".
- Missing/empty/non-string `label_id` — error mentions `label_id`.
- `findLabel` kind=not_found — error mentions the id.
- `findLabel` kind=outside_labels — error "not found under #labels".
- `findLabel` kind=unexpected_parent — error "unexpected parent".
- `findLabel` kind=labels_root_missing — error mentions `#labels`.
- `findTextPath` returns null — error "has no <textPath>".
- `setStartOffset` throwing — error surfaces the message.
- Tool name = `set_label_offset`; round-trips through `ToolRegistry`.
- Default-runtime integration with a fake `document.getElementById`:
  - happy path writes attribute correctly.
  - unparseable existing value → `old_offset: null`, attr overwritten.
  - missing `<textPath>` → error.
  - unknown id → error.
  - outside #labels → error.
  - both `window.labels` and `#labels` missing → error.

## Done criteria

- Both new files compile, lint clean, pass tests.
- `npm test` green.
- `npm run lint` matches baseline (7 warnings, 1 info; no new diagnostics).
- `npx tsc --noEmit` clean.
- Single `feat(ai): add set_label_offset tool` commit on branch `plan-302`,
  staging only the two new files plus the three index.ts additions.
