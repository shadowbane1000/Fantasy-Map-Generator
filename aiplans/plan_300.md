# Plan 300 — `remove_label` AI tool

## Use case

Implement a new AI-chat tool **`remove_label`** that permanently deletes a
single label (`<text>` element under `#labels`) along with its companion
`<textPath id="textPath_<labelId>">` definition.

This mirrors `removeLabel()` in `public/modules/ui/labels-editor.js`:

```js
function removeLabel() {
  // confirmation dialog ...
  defs.select("#textPath_" + elSelected.attr("id")).remove();
  elSelected.remove();
  // close editor ...
}
```

The user-visible behaviour: open Edit Label → "Remove" button → confirm →
the `<text>` and its `<textPath>` def are both deleted.

This is the single-label primitive of plan 297 (`remove_label_group`),
which removes every label in a group. Use case: AI lets the user delete
exactly one label without nuking the whole group.

## Exact behaviour (mirrors labels-editor.js → removeLabel 1:1)

1. Locate the `<text>` element with id `label_id` **scoped to descendants
   of `#labels`** (the document may have other elements with that id;
   trust only the one under `#labels` — same convention as
   `set_label_group`).
2. Locate the companion `<textPath_${label_id}>` element via document-wide
   `getElementById` (legacy code uses `defs.select(...)` which resolves
   globally by id, so the def can live anywhere — typically under `<defs>`).
3. Remove the textPath def first if present. Be lenient: if missing, that
   is OK — count it as 0 in the result, mirroring `remove_label_group`.
4. Remove the `<text>` element.
5. No other side effects: no `pack` write, no redraw.

## Input schema

```ts
{
  label_id: string  // required; non-empty; the <text>'s id attribute
}
```

## Validation rules / error cases

- `label_id` missing / not a string / empty after trim → error.
- Both `window.labels` D3 selection AND `document.getElementById("labels")`
  return nothing → error mentioning `#labels`.
- `<text id={label_id}>` not found anywhere in the document → error:
  `No label found with id ...`.
- `<text id={label_id}>` exists in the document but NOT under `#labels`
  → error: `label not found under #labels`.
- The `<text>`'s direct parent is not a `<g>` directly under `#labels`
  → error: `label has unexpected parent`.

## Success result

`okResult` body:

```json
{
  "ok": true,
  "label_id": "stateLabel0",
  "textpath_removed": true
}
```

`textpath_removed` = boolean: true iff the `textPath_<id>` def was
found and removed.

## Files added / modified

- ADD `src/ai/tools/remove-label.ts`
  - `LabelLookup` discriminated union (same shape as set-label-group):
    - `{ kind: "found", el, parent }` (parent is a `<g>` under `#labels`)
    - `{ kind: "labels_root_missing" }`
    - `{ kind: "not_found" }`
    - `{ kind: "outside_labels" }`
    - `{ kind: "unexpected_parent" }`
  - `RemoveLabelRuntime` interface:
    - `findLabel(label_id): LabelLookup`
    - `removeTextpath(label_id): boolean` — returns true iff a
      `textPath_<id>` element was found and removed; false if absent.
    - `removeLabel(textEl): void`
  - `defaultRemoveLabelRuntime` — copies the `set-label-group` lookup
    (window.labels D3 sel → document.getElementById fallback;
    `getElementById(label_id)` first, scope-walk fallback). For
    `removeTextpath`, calls `document.getElementById("textPath_" + id)`
    (matches the legacy `defs.select(...)` semantics — global id lookup).
    For `removeLabel`, calls `textEl.remove()`.
  - `createRemoveLabelTool(runtime?)` factory.
  - `removeLabelTool` exported singleton.
- ADD `src/ai/tools/remove-label.test.ts` — vitest covering all cases below.
- EDIT `src/ai/index.ts` — import + register + re-export the new tool.
  Place near `removeLabelGroupTool` registrations.

## Tests (Vitest)

Unit tests with a mocked `RemoveLabelRuntime`:

- Happy path with companion textPath: `<text>` and `<textPath_*>` both
  removed; result reports `textpath_removed: true`.
- Happy path WITHOUT companion textPath: `<text>` removed, result reports
  `textpath_removed: false`, no error.
- find returns `not_found` → error mentioning the id, no removal.
- find returns `outside_labels` → error: "not found under #labels".
- find returns `unexpected_parent` → error: "unexpected parent".
- find returns `labels_root_missing` → error mentioning `#labels`.
- Missing inputs (empty/whitespace/non-string/null) → errors; nothing
  called.
- `removeLabel` throwing surfaces as error.
- Tool name + registry round-trip.

Integration tests with a fake DOM (mirroring `set-label-group.test.ts`'s
`fakeEl` helpers) using the default runtime:

- Happy path: removes a label in a custom group plus its def.
- Removes label that has no companion def — `textpath_removed: false`.
- Removes label from `states` (built-in basic group) plus its def.
- Removes label from `burgLabels` plus its def.
- Unknown `label_id` → error.
- Label found elsewhere in document but not under `#labels` → error.
- Label parent isn't a direct `<g>` under `#labels` → error.
- Both `window.labels` and `#labels` missing → error.
- Uses `window.labels` D3 selection when present.

## Lint baseline (captured before implementation)

`npm run lint` (Biome): `Checked 700 files`. `Found 7 warnings. Found 1
info.` 0 errors. The 7 warnings are pre-existing on master and unrelated
to this plan (e.g. `noDynamicNamespaceImportAccess` in
`src/renderers/draw-heightmap.ts`). After implementing this plan, lint
must still report **0 errors** and must NOT introduce new warnings on
`src/ai/tools/remove-label.ts` or its test.

## Self-review (mandatory)

- [x] Plan and tasks files reviewed; both consistent.
- [x] No `pack` mutation in design (verified against `removeLabel()` source —
      it only does `defs.select("#textPath_" + id).remove()` and
      `elSelected.remove()`; no pack write).
- [x] Error taxonomy matches workflow brief and reuses set-label-group's
      `LabelLookup` discriminated union for consistency with the most
      recent label tool.
- [x] Pattern faithfully copies `set-label-group.ts`'s runtime-injection
      seam for the `findLabel` step, and `remove-label-group.ts`'s
      lenient-textPath-removal behaviour for the def deletion step.
- [x] Tests cover all listed cases including the "outside `#labels`" and
      "unexpected parent" edge cases as well as the
      "missing companion def" leniency.
- [x] Description mentions destructiveness (matches remove-label-group
      convention) so the chat-controller's confirmation policy is invoked.
