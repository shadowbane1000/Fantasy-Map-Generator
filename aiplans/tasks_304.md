# Tasks 304: `set_label_letter_spacing`

1. Capture lint baseline (`npm run lint`) — record warning/info counts in
   `aiplans/plan_304.md`. (Done.)
2. Write `aiplans/plan_304.md` with use case, behavior, schema, range
   rationale citing the slider in `src/index.html`, files, wiring, errors.
   (Done.)
3. Self-review: re-read both plan and tasks. Edit if needed. Record review
   in `plan_304.md`. (Done.)
4. Implement `src/ai/tools/set-label-letter-spacing.ts`:
   - Copy structure of `set-label-offset.ts`.
   - Import `LabelLookup` from `./set-label-group`.
   - Constants: `MIN_LETTER_SPACING = 0`, `MAX_LETTER_SPACING = 20`.
   - `SetLabelLetterSpacingRuntime` with `findLabel`, `findTextPath`,
     `getLetterSpacing`, `setLetterSpacing`.
   - `defaultSetLabelLetterSpacingRuntime` resolves `#labels`/`window.labels`,
     finds `<textPath>`, reads/writes `letter-spacing` attribute.
   - `createSetLabelLetterSpacingTool(runtime)` returns the `Tool`.
   - Tool name: `set_label_letter_spacing`.
   - Schema: required `label_id` (string), `letter_spacing` (number).
   - Validation: trim/non-empty `label_id`; finite-number check;
     `[0, 20]` inclusive range check.
   - `parseFloat` previous attribute; surface NaN as null.
   - Write `<value>px` via `runtime.setLetterSpacing`.
   - Return `okResult({ ok: true, label_id, old_letter_spacing, new_letter_spacing })`.
   - Wrap `setLetterSpacing` call in try/catch and surface the error.
   - Export `setLabelLetterSpacingTool = createSetLabelLetterSpacingTool()`.
5. Implement `src/ai/tools/set-label-letter-spacing.test.ts`:
   - Mirror `set-label-offset.test.ts` shape (FakeElement, FakeDom helpers).
   - Unit (mocked runtime) tests:
     - happy path: `letter-spacing="3px"` + input 5 → attr `"5px"`,
       returns `{ old_letter_spacing: 3, new_letter_spacing: 5 }`.
     - missing existing attr → `old_letter_spacing: null`, new applied.
     - unparseable existing attr (`"abc"`) → `old_letter_spacing: null`.
     - existing attr `"2"` (no unit) → `old_letter_spacing: 2`
       (parseFloat strips no unit / handles plain number).
     - existing attr `"40px"` → `old_letter_spacing: 40` (parseFloat strips px).
     - findLabel kind=not_found / outside_labels / unexpected_parent /
       labels_root_missing → respective errors, no setter call.
     - findTextPath null → "has no <textPath>" error.
     - missing/non-string `label_id` (undefined, null, "", "   ", 42) → error,
       no findLabel call.
     - missing/non-number `letter_spacing` (undefined, null, "5", "abc",
       true, {}) → error, no findLabel call.
     - NaN, +Infinity, -Infinity → "finite number" error.
     - Out of range (-0.01, 20.01, -10, 100) → error mentioning
       "between 0 and 20".
     - Boundary 0 inclusive → success, attr `"0px"`.
     - Boundary 20 inclusive → success, attr `"20px"`.
     - setLetterSpacing throwing → surfaces its message.
     - Tool name + registry round-trip.
   - Integration (default runtime) tests with mocked `globalThis.document`
     and `globalThis.labels`:
     - happy path writes `letter-spacing` on the textPath.
     - unparseable existing attr → `old_letter_spacing: null`, attr overwritten.
     - no `<textPath>` child → error.
     - unknown id → error.
     - label outside `#labels` → error.
     - both `#labels` and `window.labels` missing → error.
6. Wire into `src/ai/index.ts`:
   - Import `setLabelLetterSpacingTool` near `setLabelOffsetTool`.
   - Re-export `createSetLabelLetterSpacingTool`,
     `defaultSetLabelLetterSpacingRuntime`,
     `SetLabelLetterSpacingRuntime`, `setLabelLetterSpacingTool`.
   - `registry.register(setLabelLetterSpacingTool)` next to
     `setLabelOffsetTool` / `setLabelSizeTool`.
7. Verify:
   - `npm test` passes.
   - `npm run lint` does NOT regress baseline (still 7 warnings + 1 info,
     no new errors).
   - `npx tsc --noEmit` clean.
8. Commit:
   - Title: `feat(ai): add set_label_letter_spacing tool`.
   - Stage only: new tool + new test + edited `src/ai/index.ts`.
   - Don't stage `.claude/`, `current-ralph-loop.prompt`, or any pre-existing
     dirty file.
   - Don't push.
9. Report: worktree path, branch, commit SHA, test/tsc/lint status, caveats.
