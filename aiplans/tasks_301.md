# Plan 301 — tasks

## Lint baseline (must not regress)
- 700 files checked, 7 warnings, 1 info, 0 errors.

## Task list

1. **Create `src/ai/tools/set-label-size.ts`**
   - Import: `errorResult`, `getGlobal`, `okResult` from `./_shared`; `Tool`, `ToolResult` from `./index`; `LabelLookup` type from `./set-label-group`.
   - Re-implement `resolveLabelsRoot`, `isDirectGroupChildOfLabels`, `classifyFoundElement` as private file-locals (copy from set-label-group.ts).
   - Define `SetLabelSizeRuntime` interface with `findLabel`, `findTextPath`, `getFontSize`, `setFontSize`.
   - Define `defaultSetLabelSizeRuntime` implementing all four.
     - `findLabel`: same logic as `set-label-group.ts` defaultRuntime.findLabel.
     - `findTextPath`: scan `textEl.children` for first child with `tagName.toLowerCase() === "textpath"`.
     - `getFontSize`: `textPathEl.getAttribute("font-size")` or null.
     - `setFontSize`: `textPathEl.setAttribute("font-size", value)`.
   - Define `MIN_SIZE = 10`, `MAX_SIZE = 1000` constants (file-private).
   - Define `createSetLabelSizeTool(runtime?)` factory:
     - Tool name: `"set_label_size"`.
     - Description: cite labels-editor.js `changeRelativeSize`, document the divergence (no changeText), document range [10, 1000].
     - input_schema: required `label_id` (string), `size` (number).
     - execute(rawInput):
       1. Validate label_id (non-empty trimmed string).
       2. Validate size: typeof === "number", `Number.isFinite(size)`, `size > 0` → all-or-nothing single message.
       3. Range-check size in `[MIN_SIZE, MAX_SIZE]`.
       4. Call `runtime.findLabel(labelId)` and map all five LabelLookup kinds to errorResult/okResult.
       5. Call `runtime.findTextPath(textEl)`. If null → error.
       6. `runtime.getFontSize(textPathEl)` → parseFloat → if NaN/non-finite, set old_size = null; else use the parsed number.
       7. Try `runtime.setFontSize(textPathEl, size + "%")` in a try/catch; surface thrown errors.
       8. Return okResult({ label_id, old_size, new_size: size }).
   - Export `setLabelSizeTool = createSetLabelSizeTool()`.

2. **Create `src/ai/tools/set-label-size.test.ts`**
   - Imports: vitest helpers, `ToolRegistry` from `./index`, the new tool, `LabelLookup` from `./set-label-group`.
   - `fakeEl(tag, id)` helper that supports `tagName`, `id`, `parentElement`, `children`, `appendChild`, `getAttribute`, `setAttribute` (a Map of attrs).
   - `setupDom()` helper: build `<g id="labels">` containing `<g id="states">`, `<g id="addedLabels">` etc; place `<text id="addedLabel_42">` under `addedLabels`; place a `<textPath font-size="100%">` child under that text. Place a `<text id="loneText">` outside `#labels` for outside-labels test. Place a label with no textPath child for the missing-textPath test. Place a label whose textPath has unparseable font-size for the parse test.
   - Mocked-runtime suite: factory `makeRuntime(overrides)` that returns `{ runtime, findLabel, findTextPath, getFontSize, setFontSize }` all `vi.fn(...)`.
   - Cases (each exec result via `await tool.execute(...)`):
     - happy path: findLabel→found, findTextPath→non-null, getFontSize→"100%"; size=150 → ok, calls setFontSize with "150%", body `{ ok, label_id, old_size: 100, new_size: 150 }`.
     - getFontSize returns null → old_size: null, new_size still applied.
     - getFontSize returns "abc" → old_size: null, new_size still applied.
     - getFontSize returns "120px" → old_size: 120 (parseFloat handles unit suffix; document this in code or test).
     - findLabel kind=not_found → error w/ id.
     - findLabel kind=outside_labels → error /not found under #labels/.
     - findLabel kind=unexpected_parent → error /unexpected parent/.
     - findLabel kind=labels_root_missing → error /#labels/.
     - findTextPath returns null → error /no <textPath>/.
     - bad label_id (undefined, null, "", "  ", 42) → errors /label_id/ and findLabel not called.
     - missing/bad size (undefined, null, "abc", NaN) → errors /size/ and findLabel not called.
     - size = 0 / -1 / Infinity / -Infinity → errors /finite positive/ and findLabel not called.
     - size = 9 → error /between 10 and 1000/.
     - size = 1001 → error /between 10 and 1000/.
     - size = 10 and size = 1000 (boundary) → success.
     - setFontSize throws → error surfaces message.
     - registry round-trip.
   - Default-runtime DOM integration suite (no runtime override): mock `globalThis.document` and `globalThis.labels` similarly to set-label-group.test.ts. Verify happy path mutates the fake DOM; verify outside-labels error path; verify both-missing error path.

3. **Wire `src/ai/index.ts`**
   - Add `import { setLabelSizeTool } from "./tools/set-label-size";` next to the existing `setLabelGroupTool` import.
   - Add re-export block for `createSetLabelSizeTool`, `defaultSetLabelSizeRuntime`, `SetLabelSizeRuntime`, `setLabelSizeTool` next to the existing set-label-group / set-label-text re-export blocks.
   - Add `registry.register(setLabelSizeTool);` next to `registry.register(setLabelGroupTool);`.

4. **Verify locally**
   - `npm test` → green for the new tests AND no regressions.
   - `npx tsc --noEmit` → clean.
   - `npm run lint` → still 700 files, 7 warnings, 1 info, 0 errors (or strictly equivalent).

5. **Commit**
   - `git add src/ai/tools/set-label-size.ts src/ai/tools/set-label-size.test.ts src/ai/index.ts aiplans/plan_301.md aiplans/tasks_301.md`
   - `git commit -m "feat(ai): add set_label_size tool"` (HEREDOC with co-author).
   - Verify `git status` → clean apart from untracked `.claude/`, `current-ralph-loop.prompt`, and `src/ai/chat-controller.ts` if it was already dirty in the worktree.

## Self-review (post-edit pass)
- [x] tasks line up 1:1 with plan_301.md.
- [x] `getFontSize → "120px"` test added so `parseFloat` semantics are explicit.
- [x] all five `LabelLookup` kinds covered in tests.
- [x] boundary tests at exactly 10 and exactly 1000 included.
- [x] integration suite uses same `globalThis.document` mocking pattern as set-label-group.test.ts.
- [x] commit only stages files this plan owns.
