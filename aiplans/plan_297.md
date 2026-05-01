# Plan 297: `remove_label_group` AI tool

## Use case

Add a new AI chat tool, `remove_label_group`, that mirrors the
`removeLabelsGroup` function in `public/modules/ui/labels-editor.js`
1:1. The tool deletes a label group's contents — destructively.

It is the labels-layer analogue of the just-merged `remove_lake_group`
(plan 295) and earlier `remove_route_group` (plan 287). Unlike the
lakes equivalent (which **re-parents** child `<use>` elements to the
`freshwater` default group), this tool **deletes** every `<text>`
descendant of the target `<g>` and the matching `<textPath>`
definitions. For "basic" groups (`states`, `addedLabels`) the `<g>`
itself is preserved so the renderer can still emit those built-in
categories on the next regenerate; for any other group, the `<g>` is
removed too. This is destructive and irreversible — the chat
controller's system prompt already covers confirmation prompts, but the
tool description must call this out explicitly.

## Lint baseline (captured before any work)

```
Checked 692 files in 544ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

(7 warnings + 1 info, 0 errors. Final lint must NOT regress vs this.)

## Reference implementation (UI)

```js
function removeLabelsGroup() {
  const group = elSelected.node().parentNode.id;
  const basic = group === "states" || group === "addedLabels";
  // ...confirmation dialog...
  labels
    .select("#" + group)
    .selectAll("text")
    .each(function () {
      byId("textPath_" + this.id).remove();
      this.remove();
    });
  if (!basic) labels.select("#" + group).remove();
}
```

Each label is a `<text>` element under a `<g>` group. Each label has a
matching `<textPath>` definition with id `textPath_<labelId>` that
lives in `<defs>` somewhere in the document (NOT necessarily under
`#labels`). Deleting a label requires removing both. The textPath
lookup uses `byId(...)` which is `document.getElementById` — global
search.

## Behavior (exact)

Inputs:

- `group`: string (required). The SVG group id to clear/remove.

Effect:

1. Validate `group` is a non-empty trimmed string.
2. Resolve `<g id={group}>` as a direct child of `#labels`. Error if
   `#labels` is missing or no such direct `<g>` child exists.
3. For every `<text>` descendant of that `<g>`:
   - Read the `<text>`'s `id` attribute.
   - Look up an element in the document with id
     `textPath_${labelId}`. If present, remove it and increment
     `textpaths_removed`.
   - Remove the `<text>` element and increment `labels_removed`.
4. If `group` is NOT one of `BASIC_LABEL_GROUPS = ["states",
   "addedLabels"]`, also remove the `<g>` element. Set
   `group_removed = true` in that case; otherwise `false`.
5. Return `okResult({ ok: true, group, labels_removed,
   textpaths_removed, group_removed })`.

Result fields:

- `labels_removed`: number of `<text>` elements removed.
- `textpaths_removed`: number of `textPath_*` defs found and removed.
  May be `< labels_removed` when some defs were already missing — that
  is not an error (matches the legacy behavior, where `byId` returns
  `null` and `null.remove()` would throw, but the legacy code calls
  `byId("textPath_" + this.id).remove()` unconditionally; we are
  more defensive here).
- `group_removed`: boolean.

## Validation / errors

- `group` missing, non-string, empty/whitespace-only → error result.
- `#labels` SVG element missing → error.
- `<g id={group}>` is not a direct child of `#labels` → error.

(Note: there is no "default cannot be removed" rejection — basic groups
are allowed; they just keep the `<g>` shell.)

## Files added

- `src/ai/tools/remove-label-group.ts` — tool source. Exports
  `BASIC_LABEL_GROUPS`, `RemoveLabelGroupRuntime`,
  `defaultRemoveLabelGroupRuntime`, `createRemoveLabelGroupTool`,
  `removeLabelGroupTool`. Mirrors the runtime-injection seam used by
  `remove-lake-group.ts` and `remove-route-group.ts`.
- `src/ai/tools/remove-label-group.test.ts` — Vitest coverage.

## Wiring (`src/ai/index.ts`)

Add an `import` near the existing `removeLakeGroupTool` import; add an
`export` re-export block alongside the lake/route group ones; register
in the `registerAll` block near the lake/route group registrations.

## Runtime seam

```ts
export interface RemoveLabelGroupRuntime {
  /** True when an SVG `<g id={group}>` exists as a direct child of #labels. */
  groupExists(group: string): boolean;
  /**
   * Walk every <text> descendant of <g id={group}> under #labels.
   * For each, look up `textPath_<labelId>` in the document and remove
   * it if present, then remove the <text>. Returns
   * { labelsRemoved, textpathsRemoved }.
   * Throws when #labels or the group element is missing.
   */
  removeAllLabelsAndTextpaths(group: string): {
    labelsRemoved: number;
    textpathsRemoved: number;
  };
  /**
   * Remove the <g id={group}> element from #labels. Returns true on
   * success, false when the element is missing.
   */
  removeGroupElement(group: string): boolean;
}
```

`defaultRemoveLabelGroupRuntime` walks `document.getElementById("labels")`
and uses `getElementsByTagName("text")` on the matched group element to
gather every `<text>` (including nested ones — matches D3's
`selectAll("text")` semantics). For each text node, it reads its `id`,
calls `document.getElementById("textPath_" + id)` to find the def,
removes the def if found, and removes the `<text>` element.

## Tests

Use the same fake-DOM approach as `remove-lake-group.test.ts`. Cover:

1. Tool metadata (name, schema, registry round-trip).
2. `BASIC_LABEL_GROUPS` literal is `["states", "addedLabels"]`.
3. Custom group with 2 labels (each with a `textPath_*` def): both
   `<text>`s removed, both defs removed, `<g>` removed,
   `group_removed: true`, counts correct.
4. Basic group `states` with 3 labels: labels and textpaths removed,
   `<g>` preserved, `group_removed: false`.
5. Basic group `addedLabels`: same — preserved.
6. Custom group with labels missing some `textPath_*` defs: succeeds,
   `textpaths_removed < labels_removed`.
7. Empty custom group: succeeds with zeros, `<g>` removed.
8. Empty basic group: succeeds with zeros, `<g>` preserved.
9. Unknown group id: error; nothing changed.
10. `#labels` missing entirely: error.
11. `group` missing/empty/non-string/whitespace-only: error.
12. Whitespace trimming applied before lookup.

Plus a runtime-seam unit/integration test against a fake document that
exercises `defaultRemoveLabelGroupRuntime` end-to-end (text nodes
inside groups; defs in a separate `<defs>` element under `<svg>`).

## Self-review

- Confirmed: `byId("textPath_" + this.id)` in the legacy code can
  throw `null.remove()` when the def is missing; the tool is
  deliberately more lenient (ignore missing defs). This is documented.
- Confirmed: the tool does NOT delete from any pack data — labels are
  pure SVG state, no backing array on `pack`. (Unlike the lake-group
  case where `pack.features[i].group` had to be reassigned.)
- Confirmed: `BASIC_LABEL_GROUPS` is exported from the tool file (no
  natural home in `_shared/` for it; the lake equivalent
  `DEFAULT_LAKE_GROUPS` lives in `list-lake-groups.ts`, but there's no
  `list-label-groups.ts` yet).
- Confirmed: schema requires `group` as a string; description mentions
  destructiveness explicitly.
- Confirmed: `<text>` lookup uses element-tree walk (or
  `getElementsByTagName`) — it must include nested `<text>`. The UI
  code uses `selectAll("text")` which is descendant-selection so we
  match.
- Confirmed: `<g>` removal is conditional on the group not being in
  `BASIC_LABEL_GROUPS` — even when the group is empty.

## Semantic difference vs `remove_lake_group`

`remove_lake_group`: re-parents children to `freshwater` and deletes
the `<g>`. Updates `pack.features[i].group`.

`remove_label_group`: deletes children (and their defs) outright.
Touches no pack data. Keeps `<g>` for basic groups.
