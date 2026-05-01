# Plan 298 — `list_label_groups` AI tool

## Use case

Mirror the dropdown-population logic in `selectLabelGroup()` of
`public/modules/ui/labels-editor.js`:

```js
labels.selectAll(":scope > g").each(function () {
  if (this.id === "states") return;       // states is shown but not editable from this dropdown
  if (this.id === "burgLabels") return;
  select.options.add(new Option(this.id, this.id, false, this.id === group));
});
```

Give the AI a read-only equivalent: list every existing label group on
the current map, in document order, with per-group label counts and
flags marking which ids are "basic" (i.e. those `remove_label_group`
treats specially) and which the legacy editor's group-dropdown filters
out.

The user-visible feature is "open Edit Label → see the Group dropdown
listing label groups that exist". Direct analogue of `list_lake_groups`
(plan 293) and `list_route_groups` (plan 288); pairs naturally with
the just-merged `add_label_group` (plan 296), `remove_label_group`
(plan 297), and the upcoming `set_label_group` (plan 299).

We are NOT replicating the editor's filter — the AI tool exposes the
full list, with a flag so the AI can explain the legacy editor's
quirky behaviour to the user when asked.

## Lint baseline

`npm run lint` in `/workspace/.claude/worktrees/plan-298` produces
(captured before any changes):

```
Skipped 2 suggested fixes.
Checked 696 files in 554ms. No fixes applied.
Found 7 warnings.
Found 1 info.
```

The new tool must not regress this — same warning/info count, no new
errors.

## Behavior

1. Read the direct `<g>` children of the `labels` D3 selection
   (`window.labels`) — same source `selectLabelGroup()` uses. Fall back
   to `document.getElementById("labels")`'s `<g>` children when the D3
   selection is unavailable (matches the symmetry the lake/route
   variants use).
2. For each group element collect:
   - `id` — the SVG `<g>`'s `id` attribute.
   - `label_count` — count of `<text>` descendants (the labels-editor
     dialog itself counts via DOM children; label state is pure SVG
     with no `pack` mirror, so we just count `<text>` descendants of
     the `<g>` and report it).
3. Order: SVG document order — do NOT sort.
4. Return `{ count, groups: [...] }` where each entry is
   `{ id, label_count, is_basic, is_filtered_in_editor }`.
   - `is_basic` is true iff `id` is in `BASIC_LABEL_GROUPS` (imported
     from `remove-label-group.ts`: `["states", "addedLabels"]`). For
     these groups, `remove_label_group` preserves the `<g>` shell after
     removal so the renderer can still emit them on the next regenerate.
   - `is_filtered_in_editor` is true iff `id` is in
     `["states", "burgLabels"]` — these are the ones the legacy
     labels-editor's group dropdown filters out (the `if (this.id ===
     "states") return; if (this.id === "burgLabels") return;` guard).

### Fallback behavior

- `labels` D3 selection AND `#labels` element both missing → error
  `errorResult("Labels layer is unavailable; cannot list label groups. ...")`.
- No `<g>` children under `#labels` → success with `count: 0,
  groups: []`.

There is no `pack` fallback here because (unlike lakes/routes) labels
have no `pack` mirror — they live entirely in SVG. Counting `<text>`
descendants of the `<g>` is the source of truth.

## Input/return schema

Input: none (no parameters; matches `list_lake_groups` /
`list_route_groups`).

```json
{ "type": "object", "properties": {} }
```

Return (success):

```json
{
  "ok": true,
  "count": <int>,
  "groups": [
    { "id": "states",      "label_count": 3, "is_basic": true,  "is_filtered_in_editor": true },
    { "id": "burgLabels",  "label_count": 5, "is_basic": false, "is_filtered_in_editor": true },
    { "id": "addedLabels", "label_count": 0, "is_basic": true,  "is_filtered_in_editor": false },
    { "id": "myGroup",     "label_count": 2, "is_basic": false, "is_filtered_in_editor": false }
  ]
}
```

Return (error):

```json
{ "ok": false, "error": "Labels layer is unavailable; cannot list label groups. Wait for the map to finish loading." }
```

## Files

- New: `src/ai/tools/list-label-groups.ts`
- New: `src/ai/tools/list-label-groups.test.ts`
- Modify: `src/ai/index.ts` — import + export-block + `registry.register`
  (positioned near the other label / list / route-group registrations).

## Module structure (mirrors `list-lake-groups.ts`)

- Re-export `BASIC_LABEL_GROUPS` from `remove-label-group.ts` (NOT
  re-defined locally — `remove-label-group.ts` already exports it).
- Define and export `EDITOR_FILTERED_LABEL_GROUPS` const tuple
  `["states", "burgLabels"]` — matches the labels-editor literal.
- Export `LabelGroupSummary
  { id; label_count; is_basic; is_filtered_in_editor }`.
- Export `LabelGroupElement { id; textCount }` — the runtime hands
  these back; we read `textCount` directly (no pack fallback).
- Export `ListLabelGroupsRuntime` interface with:
  - `readGroupElements(): LabelGroupElement[] | null`
- Export `defaultListLabelGroupsRuntime`:
  - `readGroupElements`: try D3 selection at `window.labels`
    (`selectAll(":scope > g")._groups[0]`), then fall back to
    `document.getElementById("labels").children` filtered to `<g>`
    tags. For each `<g>`, count `<text>` descendants via
    `getElementsByTagName("text")` (matches the descendant-inclusive
    semantics of `selectAll("text")` used in the labels-editor and
    `remove-label-group.ts`).
- Export `createListLabelGroupsTool(runtime?)` factory.
- Export `listLabelGroupsTool` (default-runtime instance).

## Implementation notes

- Use the same `_shared` helpers as `list-lake-groups.ts`:
  `errorResult`, `getGlobal`, `okResult` (no `getPack` — no pack
  needed).
- Use the same D3 / DOM probe pattern (`MinimalElementLike`,
  `D3MultiSelectionLike`, etc.) — copy structure verbatim and rename.
- For the D3 selectAll selector, use `":scope > g"` to match the
  labels-editor literal (which uses `:scope > g` to skip nested `<g>`
  inside individual labels — labels can contain nested groups for
  control points / textPath defs).
- For DOM fallback, iterate `root.children` (only direct children) and
  filter to `g` tagName — matches the `:scope > g` semantics.
- For per-group `<text>` count, use `el.getElementsByTagName("text")`
  on each `<g>` — descendant-inclusive (matches `selectAll("text")`).
- Import `BASIC_LABEL_GROUPS` from `./remove-label-group` so we don't
  duplicate the constant. Keep it in scope of the `Set<string>` used
  in the result loop.

## Error cases

| Condition | Result |
| --- | --- |
| Both `window.labels` D3 selection and `#labels` element missing | error: "Labels layer is unavailable; cannot list label groups. Wait for the map to finish loading." |
| No `<g>` children under `#labels` | success; `count: 0`, `groups: []` |
| No `document` global at all | same error path as above (D3 selection also missing) |

## Tests (Vitest)

`list-label-groups.test.ts`:

1. Metadata block:
   - Tool name is `list_label_groups`.
   - Empty input schema.
   - `EDITOR_FILTERED_LABEL_GROUPS` matches `["states", "burgLabels"]`.
   - Re-uses `BASIC_LABEL_GROUPS` from `remove-label-group.ts` (both
     equal `["states", "addedLabels"]`).
   - `createListLabelGroupsTool()` produces an equivalent tool.
   - Registers and round-trips through `ToolRegistry`.

2. Tool happy path with mocked runtime:
   - 4 groups in the order specified by the use case:
     `states` (3 labels), `burgLabels` (5 labels), `addedLabels`
     (0 labels), `myGroup` (2 labels). Verify ids, counts,
     `is_basic`, and `is_filtered_in_editor` flags.
   - SVG / document order preserved even when alphabetical would
     differ.
   - Empty `<g>` list returns `count: 0, groups: []`.
   - Accepts `{}`, `null`, `undefined` input uniformly.
   - Returns error when `readGroupElements()` returns null.

3. `defaultListLabelGroupsRuntime` integration:
   - Reads `<g>` nodes from `window.labels._groups[0]` in order, with
     per-group `<text>` descendant counts.
   - Falls back to `document.getElementById("labels")` when
     `window.labels` is absent.
   - Errors when neither `window.labels` nor `#labels` element is
     available.
   - Errors when there's no `document` and no D3 selection (extreme
     headless).

## Wiring

In `src/ai/index.ts`:

- Add `import { listLabelGroupsTool } from "./tools/list-label-groups";`
  (alphabetical with the `list-*` imports — between
  `listHeightmapTemplatesTool` and `listLakeGroupsTool`).
- Add the `export { … }` block next to the `list-lake-groups`
  re-export.
- Add `registry.register(listLabelGroupsTool);` near the other label /
  list-group registrations.

## Review

Re-reading `plan_298.md` and `tasks_298.md`:

- Confirms `BASIC_LABEL_GROUPS` is imported from
  `remove-label-group.ts` (already exported there) — no duplication.
- `EDITOR_FILTERED_LABEL_GROUPS` is defined locally and matches the
  literal in `selectLabelGroup()`.
- Tool name `list_label_groups` is consistent with `list_lake_groups`,
  `list_route_groups`, etc.
- No inputs (parity with `list_lake_groups` / `list_route_groups`).
- Fallback policy: no pack mirror for labels, so we count `<text>`
  descendants directly. Documented in the tool description.
- Tests cover the spec's required cases (4-group happy path with all
  flags, document order preservation, error cases, fallback
  D3→DOM, registry round-trip).
- Wiring reuses the same import-line / export-block / register-ordering
  pattern used by `list_lake_groups`.
- Crucially: the tool exposes the FULL list of groups (including
  `states` and `burgLabels`), unlike the legacy editor dropdown. The
  `is_filtered_in_editor` flag explains the editor's quirky behaviour
  to the AI, but does not change the returned data.
