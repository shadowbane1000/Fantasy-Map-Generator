# Tasks 315 — `move_ice` tool

1. **Author** `src/ai/tools/move-ice.ts`:
   - Define `MoveIceRef` and `MoveIceLookup` (discriminated union).
   - Define `MoveIceRuntime` with `findIce(id)`, `setTransform(svgEl,
     value)`, `setOffset(iceData, x, y)`.
   - Implement `defaultMoveIceRuntime`:
     - `findIce` reads `pack.ice` via `getPack` (throws when pack/pack.ice
       missing). Resolves the SVG layer root via `getGlobal<{node?:
       () => Element|null|undefined}>("ice")` then
       `document.getElementById("ice")`. Looks up the element via
       `iceRoot.querySelector('[data-id="<id>"]')` (with a numeric
       value escaped trivially — id is a non-negative integer so no
       quotes/backslashes possible).
     - `setTransform` calls `setAttribute("transform", value)`.
     - `setOffset` writes `iceData.offset = [x, y]`.
   - Validation helpers for `id`, `x`, `y`. Reuse the pattern from
     `set-iceberg-size.ts`'s `validateId`.
   - `createMoveIceTool(runtime?)` returns the tool with name
     `"move_ice"`, schema with required `id`, `x`, `y`, and an
     `execute` that runs validation → lookup → write transform →
     write offset → returns `okResult({id, type, old_offset,
     new_offset})`.
   - Export `moveIceTool = createMoveIceTool();`.

2. **Author** `src/ai/tools/move-ice.test.ts`:
   - Unit tests with a `makeRuntime()` helper returning a mocked
     `MoveIceRuntime`.
   - Build a fake DOM with `<g id="ice">` containing a child element
     with `data-id="7"` (and others, to test scoping).
   - Cover all the cases listed in the plan.
   - Integration tests for `defaultMoveIceRuntime` that:
     - Stub `globalThis.pack`, `globalThis.ice` (D3-like with `node()`),
       `globalThis.document` (with `getElementById`).
     - Verify happy path, fallback path, and error paths.
   - Verify `moveIceTool.name === "move_ice"` and registry round-trip.

3. **Wire** in `src/ai/index.ts`:
   - Add import `moveIceTool` near `removeIceTool`/`addIcebergTool`/
     `setIcebergSizeTool` imports.
   - Add `moveIceTool` to the exported tools array near the other
     ice tools.
   - Add `registry.register(moveIceTool);` near the existing ice
     registrations.

4. **Verify**:
   - `npx tsc --noEmit` — clean.
   - `npm test` — green (full suite).
   - `npm run lint` — does not regress (same warnings as baseline,
     no new errors).

5. **Commit**:
   - Stage only: `src/ai/tools/move-ice.ts`,
     `src/ai/tools/move-ice.test.ts`, `src/ai/index.ts`,
     `aiplans/plan_315.md`, `aiplans/tasks_315.md`.
   - Commit message: `feat(ai): add move_ice tool`.

## Self-review

Re-read both plan and tasks files after writing. Check:
- Plan covers absolute-vs-delta decision (yes, in "Behavior" section).
- Plan covers all required error cases (yes).
- Tasks cover wiring + tests + verification + commit (yes).
- Implementation matches the existing pattern (`MoveIceRuntime` has the
  three injection points: lookup, transform, offset — same shape as
  `move-label`'s `findLabel/getTransform/setTransform`).
- Test list mirrors the spec in the prompt. Cross-checked against the
  workflow's "Tests (Vitest)" section: all bullets present.
- File names and tool name match the convention (`move-ice.ts`,
  `"move_ice"`).
