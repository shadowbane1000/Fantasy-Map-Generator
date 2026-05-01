# Tasks for Plan 302

1. Capture lint baseline → see plan_302.md (7 warnings, 1 info).
2. Create `src/ai/tools/set-label-offset.ts`:
   - Imports: `errorResult, getGlobal, okResult` from `./_shared`;
     `Tool, ToolResult` from `./index`; `LabelLookup` from `./set-label-group`.
   - Constants `MIN_OFFSET = 20`, `MAX_OFFSET = 80`.
   - Block comment citing `src/index.html` slider min/max.
   - `SetLabelOffsetRuntime` interface with `findLabel`, `findTextPath`,
     `getStartOffset`, `setStartOffset` methods.
   - Internal helpers `getDocument`, `resolveLabelsRoot`,
     `isDirectGroupChildOfLabels`, `classifyFoundElement` — verbatim copy
     from `set-label-size.ts`.
   - `defaultSetLabelOffsetRuntime` implementing the four methods
     against real DOM.
   - `createSetLabelOffsetTool(runtime?)` factory.
     - name: `set_label_offset`.
     - description references the labels-editor slider and clamps to
       [20, 80].
     - input_schema: `label_id` (string), `offset` (number).
     - execute:
       - validate label_id non-empty string.
       - validate offset finite number; reject NaN, Infinity.
       - clamp check `[20, 80]`.
       - call findLabel → handle each `LabelLookup` kind.
       - findTextPath → null → error.
       - parseFloat existing startOffset; NaN → null.
       - try/catch setStartOffset.
       - okResult `{ label_id, old_offset, new_offset }`.
   - `export const setLabelOffsetTool = createSetLabelOffsetTool();`.
3. Create `src/ai/tools/set-label-offset.test.ts`:
   - Adapt `set-label-size.test.ts` line-by-line. Substitute:
     - `set_label_size` → `set_label_offset`
     - `setLabelSize` / `SetLabelSize` → `setLabelOffset` / `SetLabelOffset`
     - `font-size` → `startOffset`
     - `getFontSize` / `setFontSize` → `getStartOffset` / `setStartOffset`
     - `size` arg → `offset` arg
     - existing attr value `"100%"` → `"50%"`; happy-path target → 70
     - boundaries: 10/1000 → 20/80
     - out-of-range cases: 9/1001 → 19/81; assert error matches
       `between 20 and 80`
   - Confirm registry round-trip name change.
4. Wire into `src/ai/index.ts`:
   - Add import after `set-label-group`:
     `import { setLabelOffsetTool } from "./tools/set-label-offset";`
   - Add re-export block after `set-label-group`:
     ```ts
     export {
       createSetLabelOffsetTool,
       defaultSetLabelOffsetRuntime,
       type SetLabelOffsetRuntime,
       setLabelOffsetTool,
     } from "./tools/set-label-offset";
     ```
   - Add `registry.register(setLabelOffsetTool);` next to
     `registry.register(setLabelGroupTool);`.
5. Run `npm test`. Fix until green.
6. Run `npx tsc --noEmit`. Fix until clean.
7. Run `npm run lint`. Confirm no new findings vs baseline.
8. Commit: `feat(ai): add set_label_offset tool`.
   Stage exactly:
   - `src/ai/tools/set-label-offset.ts`
   - `src/ai/tools/set-label-offset.test.ts`
   - `src/ai/index.ts`
   - `aiplans/plan_302.md`
   - `aiplans/tasks_302.md`
   Do NOT stage `.claude/`, `current-ralph-loop.prompt`, or any other dirty
   file.

## Self-review (mandatory)

Re-read plan_302.md and tasks_302.md after writing. Verify:

- Range rationale cites the slider's exact min/max from `src/index.html`.
- Test list matches the required workflow's mandatory cases.
- Wiring step lists three concrete edits to `index.ts` (import, re-export,
  register).
- Tool description references the legacy editor function it mirrors.
- No mention of `setAttributeNS`; only plain `setAttribute`.
- All field names use snake_case in the JSON output (`label_id`,
  `old_offset`, `new_offset`).

Review record: ✓ all six items confirmed present after re-read. Plan and
tasks are complete and consistent. Proceeding to implementation.
