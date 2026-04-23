# Tasks 140 — `set_label_text`

- [ ] T1 Create `src/ai/tools/set-label-text.ts`:
  - `SetLabelTextRuntime` interface with `find(label)` and `apply(id, text)`.
  - `defaultSetLabelTextRuntime`:
    - `find` — attempts `document.getElementById(label)`; if the element is a `<text>` descendant of `#labels`, build `currentText` from its `textPath > tspan` children pipe-joined. Otherwise scans `#labels text` for current-text match. Returns `{id, currentText}` on unique match, `{error: "ambiguous", ids}` on 2+, `null` on none.
    - `apply` — locates the `<text>` by id, selects the child `<textPath>`, rebuilds inner `<tspan>` nodes using the same rule as `labels-editor.js:changeText` (single-line: one `<tspan x="0">…</tspan>`; multi-line: `<tspan x="0" dy="{offset}em">…</tspan>` with the top offset formula).
  - `createSetLabelTextTool(runtime?)` and `setLabelTextTool` default instance.
  - Input schema: `label` (string) + `text` (string), both required.
  - `execute`:
    - Validate `label` non-empty string (trim for empties).
    - Validate `text` string, not empty, not whitespace-only.
    - Resolve via `runtime.find`:
      - `null` → "Label {label} not found."
      - `{error:"ambiguous"}` → "Multiple labels match text {label}: {ids.join(',')}. Pass the DOM id instead."
      - hit → `apply(id, text)`, return `okResult({id, previousText, text})`.
    - Catch apply errors with `errorResult`.

- [ ] T2 Create `src/ai/tools/set-label-text.test.ts`:
  - Injected-runtime tests for all 8 scenarios listed in the plan.
  - `defaultSetLabelTextRuntime` integration block using a fabricated SVG DOM (jsdom built-in for vitest):
    - Build `<svg><g id="labels"><g id="addedLabels"><text id="label1"><textPath><tspan x="0">Fantasy Map</tspan></textPath></text><text id="label2"><textPath><tspan x="0">Ashen</tspan><tspan x="0" dy="1em">Vale</tspan></textPath></text></g></g></svg>`.
    - Renames by id; verifies DOM tspans.
    - Renames multi-line via `|` input; verifies two tspans with `dy` attrs.
    - Finds by current text `Fantasy Map` and renames.
    - Uses `as unknown as { ... }` casts for the globalThis.document swap pattern used by `set-map-name.test.ts`.
  - Casts use the `as unknown as` chain to satisfy TS strict mode.

- [ ] T3 Register in `src/ai/index.ts`:
  - Import `setLabelTextTool` from `./tools/set-label-text`.
  - Add `registry.register(setLabelTextTool)` directly after `registry.register(setMapNameTool)`.
  - Add barrel export `createSetLabelTextTool, setLabelTextTool` (alphabetical position after `createSetHeightmapTemplateTool`).

- [ ] T4 Update `README_AI.md`:
  - Add table row after the `set_map_name` row (line 15), with description and example prompts (see plan_140.md for the row contents).

- [ ] T5 Verify:
  - `npm run build` passes.
  - `npm test` all tests pass; count increases by new test cases.
  - `npm run lint` → 7 warnings / 1 info / 0 errors (unchanged baseline).

- [ ] T6 Commit:
  - Stage the four files: `src/ai/tools/set-label-text.ts`, `src/ai/tools/set-label-text.test.ts`, `src/ai/index.ts`, `README_AI.md`, plus the two aiplans files.
  - Commit title `feat(ai): add set_label_text tool` + short body describing the capability.
