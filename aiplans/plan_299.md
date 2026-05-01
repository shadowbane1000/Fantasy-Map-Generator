# Plan 299 — `set_label_group` AI tool

## Use case

Implement a new AI-chat tool **`set_label_group`** that moves a single label
(`<text>` element) under `#labels` into a different existing label group
(`<g>` directly under `#labels`).

This mirrors `changeGroup()` in `public/modules/ui/labels-editor.js`:

```js
function changeGroup() {
  byId(this.value).appendChild(elSelected.node());
}
```

The user-visible behaviour: open Edit Label → pick a different group from
the dropdown → the label moves to that group.

This is the labels equivalent of `set_lake_group` (plan 291) and
`set_route_group`. **Crucial difference**: labels have NO `pack` mirror —
their group membership is purely SVG state (the `<text>` element's parent
`<g>`). So this tool ONLY re-parents the DOM element. It must NOT touch
`pack`.

## Exact behaviour (mirrors labels-editor.js → changeGroup 1:1)

1. Locate the `<text>` element with id `label_id` **scoped to descendants
   of `#labels`** (the document may have other elements with that id; we
   trust only the one under `#labels`).
2. Locate the `<g id={group}>` element that is a **direct child of
   `#labels`**.
3. Re-parent the `<text>` under that `<g>` via `targetGroup.appendChild(textEl)`.
4. No other side effects: no `pack` write, no redraw, no reflow.

## Input schema

```ts
{
  label_id: string  // required; non-empty; the <text>'s id attribute
  group:    string  // required; non-empty; target <g> id, must already exist
}
```

Both fields required. No id/name disambiguation logic (unlike lake) — the
caller already knows the exact label id (likely from a prior listing tool).

## Validation rules / error cases

- `label_id` missing / not a string / empty after trim → error.
- `group` missing / not a string / empty after trim → error.
- Both `window.labels` D3 selection AND `document.getElementById("labels")`
  return nothing → error: `#labels SVG element not found.` (or similar).
- `<text id={label_id}>` not found anywhere in the document → error:
  `No label found with id ...`.
- `<text id={label_id}>` exists but is NOT under `#labels` (escaped from
  the labels layer for some reason) → error:
  `label not found under #labels`.
- The found `<text>`'s direct parent is not a `<g>` directly under
  `#labels` → error: `label has unexpected parent`.
- `<g id={group}>` not present as a direct child of `#labels` → error
  with the list of available group ids.

## Success result

`okResult` body:

```json
{
  "ok": true,
  "label_id": "stateLabel0",
  "old_group": "states",
  "new_group": "addedLabels",
  "changed": true
}
```

`changed === false` iff `old_group === new_group` (no DOM mutation
performed; idempotent success).

## Files added / modified

- ADD `src/ai/tools/set-label-group.ts`
  - `SetLabelGroupRuntime` interface with:
    - `findLabel(label_id): LabelLookup` — discriminated union:
      - `{ kind: "found", el, parent }` (parent is the `<g>` under `#labels`)
      - `{ kind: "labels_root_missing" }`
      - `{ kind: "not_found" }` — id not found anywhere
      - `{ kind: "outside_labels" }` — found a `<text id=…>` but not under `#labels`
      - `{ kind: "unexpected_parent" }` — found under `#labels` but parent
        is not a direct `<g>` child of `#labels`
    - `findTargetGroup(group): { kind: "found", el } | { kind: "missing", available }`
      — list available `<g>` ids on miss for a helpful error message.
    - `move(textEl, targetGroupEl): void` — calls `targetGroupEl.appendChild(textEl)`.
  - `defaultSetLabelGroupRuntime` — wires through `window.labels` (D3
    selection) first, then `document.getElementById("labels")` as a
    fallback. Searches via `labelsRoot.querySelector(\`#\${cssEscapedId}\`)`
    scoped to `#labels`. The escaped-id helper mirrors the one in
    set-lake-group; we only need to escape `\\` and `"`.
  - `createSetLabelGroupTool(runtime?)` factory.
  - `setLabelGroupTool` exported singleton.
- ADD `src/ai/tools/set-label-group.test.ts` — vitest covering the cases
  in the workflow brief (see below).
- EDIT `src/ai/index.ts` — import + register + re-export the new tool.
  Place near `setLakeGroupTool` registrations.

## Tests (Vitest)

Unit tests with a mocked `SetLabelGroupRuntime`:

- Happy path: find-found + group-found + move called → `changed: true`,
  result body has correct old/new group.
- No-op: `target group === current parent` → `move` not called, result
  has `changed: false`.
- Missing/bad inputs: `label_id` and `group` empty/missing → error.
- find returns `not_found` → error.
- find returns `outside_labels` → error: "not found under #labels".
- find returns `unexpected_parent` → error: "unexpected parent".
- find returns `labels_root_missing` → error mentioning `#labels`.
- target-group returns `missing` → error includes available list.
- Tool name + registry round-trip.

Integration tests with a fake DOM (mirroring `set-lake-group.test.ts`'s
`fakeEl` helpers) using the default runtime:

- Move a label in `addedLabels` to a custom group `myGroup` → DOM moved,
  result correct.
- Same-group → `changed: false`, exactly one parent (idempotent).
- Move from `states` → custom group works (the editor filters this out
  of its dropdown but the AI tool does not).
- Move from `burgLabels` → custom group works.
- Unknown `label_id` → error.
- Unknown target `group` → error; DOM unchanged.
- Label found in document but outside `#labels` → error.
- Label whose parent is not a direct `<g>` under `#labels` (e.g. nested
  inside another container) → error.
- Both `window.labels` AND `document.getElementById("labels")` missing
  → error.

## Lint baseline (captured before implementation)

`npm run lint` (Biome): `Checked 696 files`. `Found 7 warnings.
Found 1 info.` 0 errors. The 7 warnings include the existing
`noDynamicNamespaceImportAccess` warnings in `src/renderers/draw-heightmap.ts`
and similar — they are pre-existing on master and unrelated to this plan.
After implementing this plan, lint must still report **0 errors** and
must NOT introduce new warnings on `src/ai/tools/set-label-group.ts` or
its test.

## Self-review (mandatory)

- [x] Plan and tasks files reviewed; both consistent.
- [x] No `pack` mutation in design (verified against `changeGroup()` source).
- [x] Error taxonomy matches workflow brief.
- [x] Pattern faithfully copies `set-lake-group.ts`'s runtime-injection seam,
      stripping the lake-feature lookup / pack-write code.
- [x] Tests cover all listed cases including the "outside `#labels`" and
      "unexpected parent" edge cases that don't exist in `set-lake-group`.
