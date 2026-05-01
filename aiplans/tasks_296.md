# Tasks 296 — `add_label_group`

1. Capture lint baseline output (DONE; see plan_296.md).
2. Write `src/ai/tools/add-label-group.ts`:
   - Import `sanitizeGroupName` from `./add-route-group` (re-export it).
   - Import `errorResult`, `getGlobal`, `okResult` from `./_shared`.
   - Define `IdExistsCheck`, `AddLabelGroupRuntime` interface.
   - Define internal `ElementLike`, `D3LabelsLike` types.
   - `resolveLabelsRoot()` helper: prefer `window.labels` D3 selection,
     fall back to `document.getElementById("labels")`.
   - `findStatesTemplate()` helper: returns `<g id="states">` when present.
   - `buildBareG()` helper: SVG namespace `createElementNS`, fallback
     `createElement`.
   - `defaultAddLabelGroupRuntime` with `idExists` and `appendGroup`.
   - `createAddLabelGroupTool(runtime?)` factory.
   - `addLabelGroupTool` exported.
3. Write `src/ai/tools/add-label-group.test.ts` covering:
   - Happy path → `appendGroup` called with sanitized id; result
     `{ ok: true, id: ... }`.
   - Sanitization: `My Cool Group!` → `my_cool_group`.
   - **No `route-` prefix** regression guard.
   - Non-string name (undefined, null, 42, true, {}, []) rejected.
   - Empty / whitespace-only names rejected.
   - All-punctuation name (sanitized empty) rejected.
   - Numeric-leading sanitized name rejected.
   - Collision with tag info (`<g>`).
   - Collision without tag info.
   - `appendGroup` failures surfaced.
   - Tool name is `add_label_group`.
   - `ToolRegistry.list()` round-trip.
   - Default runtime integration (fake DOM):
     - D3 path appends a `<g>` under `lakes`-equivalent (`labels`).
     - DOM fallback when `window.labels` undefined.
     - Donor inheritance from `<g id="states">`.
     - `createElementNS` fallback when no donor.
     - Errors when neither `window.labels` nor `#labels` element.
     - Collision when `<g id="states">` blocks reuse.
     - Collision when an unrelated element elsewhere has the same id.
4. Wire `addLabelGroupTool` into `src/ai/index.ts`:
   - Import line near `addLakeGroupTool`.
   - Barrel export block near `addLakeGroupTool`.
   - `registry.register(addLabelGroupTool)` near
     `registry.register(addLakeGroupTool)`.
5. Run `npx tsc --noEmit` — must be clean.
6. Run `npm test` — only the new tests should change; full suite passes.
7. Run `npm run lint` — summary must not regress vs baseline (7 warn / 1
   info).
8. Self-review the diff: only intended files touched, no stray edits to
   `chat-controller.ts` or other dirty files.
9. Stage only intended files; commit with message
   `feat(ai): add add_label_group tool` plus Co-Authored-By trailer.
10. Do NOT push. Report SHA, branch, and verification outcomes.
