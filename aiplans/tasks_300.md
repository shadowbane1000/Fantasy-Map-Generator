# Tasks 300 — `remove_label` AI tool

1. **Lint baseline**: `npm run lint` and capture the trailing summary.
   Recorded in `plan_300.md` (7 warnings + 1 info, 0 errors).

2. **Plan**: write `aiplans/plan_300.md` with use-case, behaviour, schema,
   validation, files, error cases. (Done.)

3. **Tasks**: write `aiplans/tasks_300.md`. (This file.)

4. **Self-review**: re-read both files; verify; record in `plan_300.md`
   under "Self-review". (Done.)

5. **Implement** `src/ai/tools/remove-label.ts`:
   - Define `LabelLookup` discriminated union (re-export so tests can
     reference it):
     - `{ kind: "found"; el: Element; parent: Element }`
     - `{ kind: "labels_root_missing" }`
     - `{ kind: "not_found" }`
     - `{ kind: "outside_labels" }`
     - `{ kind: "unexpected_parent" }`
   - Define `RemoveLabelRuntime`:
     - `findLabel(labelId: string): LabelLookup`
     - `removeTextpath(labelId: string): boolean`
     - `removeLabel(textEl: Element): void`
   - `defaultRemoveLabelRuntime`:
     - `findLabel`: copy the resolution+classification logic from
       `set-label-group.ts` verbatim (window.labels D3 sel first,
       then `document.getElementById("labels")`; then
       `document.getElementById(labelId)` first, then a scoped
       `querySelectorAll("text")` fallback; `classifyFoundElement`
       enforces `<text>` tag, descendant-of-#labels, parent is direct
       `<g>` child of #labels).
     - `removeTextpath`: `document.getElementById("textPath_" + labelId)`
       — call `.remove()` if found and return true; return false when
       absent or document missing.
     - `removeLabel`: `textEl.remove()`.
   - `createRemoveLabelTool(runtime?)` returns a `Tool` with:
     - name: `"remove_label"`.
     - description: makes destructiveness explicit (mentions deleting the
       `<text>` and its companion `<textPath>` def; mirrors editor's
       Remove button; permanent).
     - input_schema requires `label_id` only.
     - execute:
       - validate input (string, non-empty after trim).
       - `runtime.findLabel(labelId)`; map non-`found` kinds to errors.
       - `textpath_removed = runtime.removeTextpath(labelId)`.
       - try { `runtime.removeLabel(textEl)` } catch → errorResult.
       - return `okResult({ ok: true, label_id, textpath_removed })`.
   - export singleton `removeLabelTool`.

6. **Implement** `src/ai/tools/remove-label.test.ts`:
   - Unit tests with `vi.fn`-mocked runtime — see plan for the full list.
   - Integration tests with the same fake DOM helpers used in
     `set-label-group.test.ts`, plus a `defs` container and `textPath_*`
     elements; toggle `textpath_removed` true/false branch.

7. **Wire**: edit `src/ai/index.ts`:
   - Import: `import { removeLabelTool } from "./tools/remove-label";`
     (alphabetically right after `remove-label-group`).
   - Re-export block alongside the other remove-label-group exports.
   - `registry.register(removeLabelTool);` near `removeLabelGroupTool`.

8. **Verify**:
   - `npm test` passes.
   - `npm run lint` reports 0 errors AND no new warnings/info on the new
     files versus the baseline (7 warnings + 1 info).
   - `npx tsc --noEmit` is clean.

9. **Commit** on branch `plan-300`:
   - Stage only:
     - `src/ai/tools/remove-label.ts`
     - `src/ai/tools/remove-label.test.ts`
     - `src/ai/index.ts` (registration + re-export only)
     - `aiplans/plan_300.md`
     - `aiplans/tasks_300.md`
   - Message: `feat(ai): add remove_label tool`.
   - Do NOT push. Do NOT commit `.claude/`,
     `current-ralph-loop.prompt`, or `src/ai/chat-controller.ts`.
