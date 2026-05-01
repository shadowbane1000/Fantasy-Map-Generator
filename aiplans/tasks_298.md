# Tasks 298 — `list_label_groups` AI tool

Working on branch `plan-298` in
`/workspace/.claude/worktrees/plan-298`.

## 1. Baseline (DONE inline in plan_298.md)

- [x] `npm run lint` — captured 7 warnings, 1 info, 0 errors. Recorded
      in `plan_298.md`.

## 2. Create `src/ai/tools/list-label-groups.ts`

- [ ] Imports:
  - `errorResult`, `getGlobal`, `okResult` from `./_shared`.
  - `Tool`, `ToolResult` from `./index`.
  - `BASIC_LABEL_GROUPS` from `./remove-label-group`.
- [ ] Define `EDITOR_FILTERED_LABEL_GROUPS = ["states", "burgLabels"]
      as const`. JSDoc explaining it's the literal from
      `selectLabelGroup` in `labels-editor.js`.
- [ ] Define and export interfaces:
  - `LabelGroupSummary { id: string; label_count: number; is_basic:
    boolean; is_filtered_in_editor: boolean }`.
  - `LabelGroupElement { id: string; textCount: number }`.
  - `ListLabelGroupsRuntime { readGroupElements():
    LabelGroupElement[] | null }`.
- [ ] Internal `MinimalElementLike`, `D3MultiSelectionLike`,
      `LabelsD3SelectionLike` — copy/rename from list-lake-groups.
- [ ] `countTextDescendants(el)` — uses
      `el.getElementsByTagName("text")` and returns its `length`;
      defensive `0` when method/property absent.
- [ ] `readFromD3Selection()`:
  - Get `labels` via `getGlobal<LabelsD3SelectionLike>("labels")`.
  - Bail (`null`) if no D3 selection / no `selectAll`.
  - Call `selectAll(":scope > g")` and read `_groups[0]`.
  - Loop nodes; build `LabelGroupElement[]` with `id` and
    `textCount`.
- [ ] `readFromDom()`:
  - Bail if `typeof document === "undefined"`.
  - `document.getElementById("labels")` — return `null` when missing.
  - Iterate `root.children`; filter `tagName.toLowerCase() === "g"`;
    skip non-string ids.
  - Use `countTextDescendants` for each.
- [ ] `defaultListLabelGroupsRuntime.readGroupElements()`: try D3 first,
      fall back to DOM.
- [ ] `createListLabelGroupsTool(runtime = defaultListLabelGroupsRuntime)`:
  - Name: `list_label_groups`.
  - Empty schema.
  - Description references the labels-editor source, the four-flag
    return shape, and notes that the AI tool exposes the full list
    (unlike the legacy editor's dropdown which filters out
    `states`/`burgLabels`).
  - `execute`: read elements; error on `null`; build a
    `Set<string>(BASIC_LABEL_GROUPS)` and a
    `Set<string>(EDITOR_FILTERED_LABEL_GROUPS)`; map to
    `LabelGroupSummary[]`; return `okResult({ count, groups })`.
- [ ] Export `listLabelGroupsTool = createListLabelGroupsTool()`.

## 3. Create `src/ai/tools/list-label-groups.test.ts`

- [ ] Import `vitest` helpers, `ToolRegistry`, all the exports from
      `list-label-groups`, plus `BASIC_LABEL_GROUPS` from
      `remove-label-group`.
- [ ] `makeRuntime(overrides)` helper returning `runtime` +
      `readGroupElements` mock.
- [ ] Metadata block:
  - Tool name + empty schema.
  - `EDITOR_FILTERED_LABEL_GROUPS` literal check.
  - Verify equality with `BASIC_LABEL_GROUPS` from
    `remove-label-group`.
  - `createListLabelGroupsTool()` produces equivalent tool.
  - Registers + round-trips through `ToolRegistry`.
- [ ] Tool happy path with mocked runtime:
  - 4 groups in document order:
    - `states` (3 labels) → is_basic=true, is_filtered=true.
    - `burgLabels` (5 labels) → is_basic=false, is_filtered=true.
    - `addedLabels` (0 labels) → is_basic=true, is_filtered=false.
    - `myGroup` (2 labels) → is_basic=false, is_filtered=false.
  - Verify all four returned entries with full shape.
  - Document-order test where alphabetical would differ.
  - Empty `<g>` list returns `count: 0, groups: []`.
  - Accepts `{}`, `null`, `undefined` input.
  - Errors when `readGroupElements()` returns null.
- [ ] `defaultListLabelGroupsRuntime` integration block:
  - Stash and restore `globalThis.labels` / `globalThis.document` in
    `afterEach`.
  - D3 path: stub `globalThis.labels` with `_groups[0]` containing
    fake nodes that expose `getElementsByTagName("text")` returning
    `{ length: N }`. Verify counts and order; verify the
    `selectAll(":scope > g")` selector is what the runtime requested.
  - DOM fallback path: stub `document.getElementById("labels")` with
    `children` mix (some `<g>`, one non-`<g>`, plus per-`<g>`
    `getElementsByTagName("text")` shim).
  - Both-missing error path.
  - No-document block (separate `describe` wiping `document` /
    `labels`) verifies error.

## 4. Wire into `src/ai/index.ts`

- [ ] Add `import { listLabelGroupsTool } from "./tools/list-label-groups";`
      between `listHeightmapTemplatesTool` and `listLakeGroupsTool`
      (alphabetical with `list-*` imports).
- [ ] Add an `export { … } from "./tools/list-label-groups";` block
      adjacent to (immediately preceding) the `list-lake-groups`
      re-export. Export `createListLabelGroupsTool`,
      `defaultListLabelGroupsRuntime`,
      `EDITOR_FILTERED_LABEL_GROUPS`, `LabelGroupElement`,
      `LabelGroupSummary`, `ListLabelGroupsRuntime`,
      `listLabelGroupsTool`.
- [ ] Add `registry.register(listLabelGroupsTool);` next to
      `registry.register(listLakeGroupsTool);`.

## 5. Verify

- [ ] `npm test -- list-label-groups` — all new tests pass.
- [ ] `npm test` — full suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint 2>&1 | tail -10` — same warnings/info count as
      baseline (7 warnings, 1 info).

## 6. Commit

- [ ] `git status` — confirm only the three files (one new tool, one
      new test, one edited `src/ai/index.ts`) are staged. NEVER commit
      `.claude/`, `current-ralph-loop.prompt`, or any pre-existing
      dirty file.
- [ ] `git add src/ai/tools/list-label-groups.ts
      src/ai/tools/list-label-groups.test.ts src/ai/index.ts`
- [ ] `git commit -m "feat(ai): add list_label_groups tool"` (HEREDOC,
      includes the Co-Authored-By trailer).

## 7. Report

- Worktree path & branch (`/workspace/.claude/worktrees/plan-298`,
  `plan-298`).
- Commit SHA.
- Confirmation: tests pass, tsc clean, lint baseline → final.
- Caveats (if any).
