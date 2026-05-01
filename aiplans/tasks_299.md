# Tasks 299 — `set_label_group`

Linear order. Stop on red.

1. **Capture lint baseline** (DONE in plan_299.md).

2. **Author** `src/ai/tools/set-label-group.ts`:
   - Imports: `errorResult, getGlobal, okResult` from `./_shared`,
     `Tool, ToolResult` types from `./index`.
   - Discriminated union `LabelLookup` for `findLabel` results:
     `{ kind: "found"; el: Element; parent: Element }`,
     `{ kind: "not_found" }`,
     `{ kind: "outside_labels" }`,
     `{ kind: "unexpected_parent" }`,
     `{ kind: "labels_root_missing" }`.
   - Discriminated union `TargetGroupLookup`:
     `{ kind: "found"; el: Element }`,
     `{ kind: "missing"; available: string[] }`,
     `{ kind: "labels_root_missing" }`.
   - `SetLabelGroupRuntime` interface with three methods:
     `findLabel(label_id)`, `findTargetGroup(group)`,
     `move(textEl, targetGroupEl)`.
   - `defaultSetLabelGroupRuntime`:
     - `resolveLabelsRoot()` helper checks `window.labels` D3 selection
       first via `getGlobal<{ node?: () => Element|null }>("labels")`,
       then falls back to `document.getElementById("labels")`.
     - `findLabel`:
       - If labels root missing → `labels_root_missing`.
       - Use `document.getElementById(label_id)` first (cheap path).
         If found and tag is `text` AND it's a descendant of labels-root
         (walk parentElement chain) AND its direct parent is a direct
         `<g>` child of labels-root → `found` with parent. If found
         tag != `text` or not under labels-root → `outside_labels` /
         `unexpected_parent` accordingly.
       - If `document.getElementById` returns null → fallback: scan
         `labelsRoot.querySelectorAll("text")` for one with matching
         id; classify same way.
     - `findTargetGroup`:
       - If labels root missing → `labels_root_missing`.
       - Iterate labelsRoot.children, find one with `tagName == "g"` and
         matching id → `found`. Otherwise collect all `<g>` ids and
         return `missing` with that array.
     - `move(textEl, targetGroupEl)` simply calls
       `targetGroupEl.appendChild(textEl)`.
   - `createSetLabelGroupTool(runtime = default)` factory matching the
     `Tool` shape with name `"set_label_group"`, description (string),
     and `input_schema` requiring `label_id` and `group`.
   - `execute`:
     - Validate `label_id` and `group` (non-empty strings, trimmed).
     - Call `findLabel(label_id)`; map non-`found` kinds to specific
       error messages. For `unexpected_parent`, message exactly
       "label has unexpected parent". For `outside_labels`,
       "label not found under #labels".
     - Call `findTargetGroup(group)`; map non-`found` kinds to errors.
       On `missing`, include `{ available }` as extra.
     - Compute `oldGroupId = parent.id` (where `parent` was returned
       by `findLabel`).
     - If `oldGroupId === group` AND the label's current parent IS the
       target group element → no-op: return `okResult({ label_id,
       old_group: oldGroupId, new_group: group, changed: false })`.
     - Otherwise call `runtime.move(textEl, targetGroupEl)` inside try/
       catch; on throw, `errorResult(err.message)`.
     - On success return `okResult({ label_id, old_group: oldGroupId,
       new_group: group, changed: true })`.
   - Export `setLabelGroupTool = createSetLabelGroupTool()`.

3. **Author** `src/ai/tools/set-label-group.test.ts`:
   - Build a `fakeEl(tag, id)` helper similar to `set-lake-group.test.ts`,
     including `appendChild` that re-parents (removes from old parent
     children list first), and `querySelectorAll("text")` that walks
     descendants.
   - Make `setupDom()` create `<g id="labels">` with children
     `<g id="states">`, `<g id="burgLabels">`, `<g id="addedLabels">`,
     `<g id="myGroup">`, plus `<text id="stateLabel0">` inside `states`,
     `<text id="burgLabel5">` inside `burgLabels`,
     `<text id="addedLabel_42">` inside `addedLabels`.
   - Stub `globalThis.document.getElementById` to look up the entire
     fake tree (a flat map of ids → elements).
   - Beforeach/aftereach to restore `document` global.
   - Unit suite using mocked `SetLabelGroupRuntime` covering:
     happy path, no-op, missing inputs, every `LabelLookup` failure
     kind, every `TargetGroupLookup` failure kind, `move` throwing.
   - Integration suite using `setLabelGroupTool` (default runtime):
     - Move addedLabel_42 from `addedLabels` to `myGroup`: verify text's
       parent is now `myGroup`, addedLabels no longer contains it,
       result body correct.
     - Same-group no-op: verify `changed: false`, addedLabels still
       contains it exactly once.
     - Move stateLabel0 from `states` to `myGroup`: works.
     - Move burgLabel5 from `burgLabels` to `myGroup`: works.
     - Unknown `label_id`: error.
     - Unknown target `group`: error; DOM unchanged.
     - Label outside `#labels`: error.
     - Label whose parent is a non-`<g>` (or a `<g>` not directly under
       `#labels`): error "unexpected parent".
     - Both labels root missing: error.
     - Empty/missing inputs: error each.
   - Tool name + registry round-trip via `ToolRegistry`.

4. **Wire** `src/ai/index.ts`:
   - Add import line for `setLabelGroupTool` near the other label-group
     imports (alphabetic order around line 244).
   - Add an `export { ... } from "./tools/set-label-group";` block in the
     barrel re-exports near the `set-lake-group` block.
   - Add `registry.register(setLabelGroupTool);` line near the
     `setLakeGroupTool` and `addLabelGroupTool` registrations
     (around line 2552).

5. **Run** `npx tsc --noEmit`. Fix any errors.

6. **Run** `npm test -- set-label-group`. Iterate until green.

7. **Run** the full `npm test` suite. Confirm no regressions.

8. **Run** `npm run lint`. Confirm 0 errors and the warning/info counts
   match the pre-implementation baseline (7 warnings, 1 info). If
   higher, fix.

9. **Commit** on branch `plan-299` with message
   `feat(ai): add set_label_group tool`. Stage only:
   - `src/ai/tools/set-label-group.ts`
   - `src/ai/tools/set-label-group.test.ts`
   - `src/ai/index.ts`
   - `aiplans/plan_299.md`
   - `aiplans/tasks_299.md`
   Do NOT stage `.claude/`, `current-ralph-loop.prompt`, or any
   pre-existing dirty file. Do NOT push.
