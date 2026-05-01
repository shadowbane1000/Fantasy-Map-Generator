# Tasks 297: `remove_label_group` tool

1. Capture lint baseline (already captured in `plan_297.md`):
   `Found 7 warnings. Found 1 info.`
2. Create `src/ai/tools/remove-label-group.ts`:
   - Export `BASIC_LABEL_GROUPS = ["states", "addedLabels"] as const`.
   - Export `RemoveLabelGroupRuntime` interface with three methods:
     `groupExists(group)`, `removeAllLabelsAndTextpaths(group)`,
     `removeGroupElement(group)`.
   - Export `defaultRemoveLabelGroupRuntime`:
     - `groupExists`: looks up `#labels`, scans direct `<g>` children
       for matching id.
     - `removeAllLabelsAndTextpaths`: collects every `<text>` under
       the group via `getElementsByTagName("text")`, then for each:
       - reads `id`,
       - calls `document.getElementById("textPath_" + id)` and
         removes if non-null (`textpathsRemoved++`),
       - removes the `<text>` (`labelsRemoved++`).
       - Throws when document, `#labels`, or the group element is
         missing.
     - `removeGroupElement`: looks up the direct `<g>` child of
       `#labels` by id; calls `.remove()` if found; returns boolean.
   - Export `createRemoveLabelGroupTool(runtime?)` factory.
   - Export `removeLabelGroupTool` default instance.
   - Tool description: explicitly call out that this is destructive
     and irreversible; explain the basic-vs-custom split.
   - `execute`:
     - Validate `group` is a non-empty trimmed string.
     - Trim it.
     - Check `runtime.groupExists(group)`; error with the bad id.
     - Call `removeAllLabelsAndTextpaths(group)`. Catch and surface
       any runtime error.
     - Determine `groupRemoved = !BASIC_LABEL_GROUPS.includes(group)`.
     - If `groupRemoved`, call `removeGroupElement(group)`.
     - Return `okResult({ ok: true, group, labels_removed,
       textpaths_removed, group_removed })`.
3. Create `src/ai/tools/remove-label-group.test.ts`:
   - `makeRuntime()` helper for vi.fn-mocked runtime; builds tool via
     `createRemoveLakeGroupTool(handles.runtime)`.
   - Metadata block: name, schema, factory equivalence, registry
     round-trip, `BASIC_LABEL_GROUPS` literal check.
   - Mocked-runtime block:
     - Happy path on custom group `myCustom` — counts forwarded,
       `removeGroupElement` called, `group_removed: true`.
     - Basic groups `states` and `addedLabels` — labels removed,
       `removeGroupElement` NOT called, `group_removed: false`.
     - Group missing → error; no other runtime methods called.
     - Runtime throws → error; `removeGroupElement` not called.
     - Invalid input shapes (`null`, `undefined`, `42`, `""`, `"   "`).
     - Object input without `group` key.
     - Whitespace trimming.
   - Integration block: build a fake DOM with `#labels` containing
     `<g id="states">`, `<g id="addedLabels">`, `<g id="custom">`,
     each with `<text id="...">`s; build a fake `<defs>` under the
     same root containing `textPath_*` elements. Make
     `getElementById` walk the whole tree.
     - Happy path custom group: 2 labels + 2 defs removed; `<g>`
       removed.
     - Basic group `states`: 3 labels + 3 defs removed; `<g>`
       preserved.
     - Basic group `addedLabels`: preserved.
     - Custom group with one missing def: counts split.
     - Empty custom group: counts 0; `<g>` removed.
     - Empty basic group: counts 0; `<g>` preserved.
     - Unknown group id: error; nothing changed.
     - `#labels` missing entirely: error.
   - `defaultRemoveLabelGroupRuntime` unit-edge cases (no document,
     missing `#labels`, missing group element).
4. Wire into `src/ai/index.ts`:
   - Add `import { removeLabelGroupTool } from
     "./tools/remove-label-group";` next to `removeLakeGroupTool`.
   - Add the `export { ... } from "./tools/remove-label-group"` block
     alongside the existing `remove-lake-group` re-export block,
     including `BASIC_LABEL_GROUPS`.
   - Register: `registry.register(removeLabelGroupTool);` next to
     `removeLakeGroupTool` registration.
5. Verify:
   - `npm test` passes.
   - `npx tsc --noEmit` clean.
   - `npm run lint` not regressed vs baseline (still
     `7 warnings + 1 info`, 0 errors).
6. Commit on branch `plan-297` with message
   `feat(ai): add remove_label_group tool`. Stage only the two new
   files plus the `src/ai/index.ts` registration line(s). Do not
   commit `.claude/`, `current-ralph-loop.prompt`, or any unrelated
   pre-existing dirty file. Do not push.

## Self-review

Re-read plan + tasks. Verifications:

- The `BASIC_LABEL_GROUPS` literal matches the legacy code's `group
  === "states" || group === "addedLabels"`. Yes.
- The runtime seam matches the lake-group / route-group factory shape
  so it composes cleanly with the registry. Yes.
- Tool description mentions destructiveness explicitly. Yes.
- The tool does NOT modify pack data — labels are pure SVG. Verified
  by reading the legacy function: it only touches `<text>` and
  `textPath_*` nodes. No `pack` mutation needed. Yes.
- `getElementsByTagName("text")` is descendant-inclusive (matches D3's
  `selectAll("text")` semantics). Yes.
- The lookup of `textPath_*` defs uses `document.getElementById`
  (matches `byId` in the legacy code). The defs may live anywhere in
  the document, not just under `#labels`. Yes.
- Tests cover the basic vs custom case, missing defs, empty groups,
  unknown groups, validation, and round-trip. Yes.
- Edge: when a custom group is removed, `removeAllLabelsAndTextpaths`
  removes the children FIRST, then `removeGroupElement` removes the
  empty `<g>`. Order matches the legacy UI. Yes.
- Edge: when label removal fails partway, the tool surfaces the
  error and does NOT continue to remove the group element. The
  partial state is preserved (matches the legacy behavior of throwing
  during `each(...)` and stopping). Yes.
