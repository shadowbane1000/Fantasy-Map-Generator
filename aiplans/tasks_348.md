# Tasks 348: `set_emblem_position`

## 1. Read context
- [x] `CLAUDE.md`, `src/types/PackedGraph.ts`, `src/types/global.ts`,
      `src/ai/tools/index.ts`, `src/ai/tools/_shared/*`.
- [x] `src/ai/tools/set-emblem-shield.ts` + `.test.ts` (sibling).
- [x] `src/ai/tools/set-emblem-size.ts` + `.test.ts` (sibling).
- [x] `src/ai/tools/move-burg.ts` / `move-marker.ts` (x/y validation).
- [x] `public/modules/ui/emblems-editor.js` `dragEmblem` end handler
      (lines 520-537), `changeSize` fallback chain (lines 194-195).

## 2. Capture lint baseline
- [x] `npm run lint 2>&1 | tail -50` — clean (recorded in plan).

## 3. Write plan_348.md
- [x] Use case + legacy reference.
- [x] Lint baseline.
- [x] Behavior, schema, validation, errors, success result.
- [x] Files, tests, verification.
- [x] Self-review section.

## 4. Write tasks_348.md
- [x] This file.

## 5. Self-review (mandatory)
- [x] Re-read plan_348.md and tasks_348.md.
- [x] Verify: all three entity types tested (state/province/burg).
- [x] Verify: both-null CLEAR with `'x' in coa === false`.
- [x] Verify: partial null/number rejected (both permutations).
- [x] Verify: other coa fields preserved on SET and CLEAR.
- [x] Verify: rounding to 2 decimals tested.
- [x] Document corrections in plan_348.md "## Self-review".

## 6. Implement
- [ ] Create `src/ai/tools/set-emblem-position.ts`:
  - Reuse `EMBLEM_ENTITY_TYPES`, `EmblemEntityType`,
    `resolveEmblemEntityType` from `set-emblem-size.ts`.
  - `EmblemPositionRef { i, name, previousX, previousY }`.
  - `SetEmblemPositionRuntime { find, apply }` where `apply` takes
    `(entityType, i, x: number | null, y: number | null)`.
  - `defaultSetEmblemPositionRuntime`:
    - `find` selects from `pack.states` / `pack.provinces` /
      `pack.burgs` via `findEntityByRef`; returns
      `{ i, name, previousX: entity.coa?.x ?? null, previousY: entity.coa?.y ?? null }`.
    - `apply`:
      - SET (x and y are numbers, already rounded): initialize
        `entity.coa = entity.coa ?? {}`, write
        `entity.coa.x = x`, `entity.coa.y = y`.
      - CLEAR (both null): if `entity.coa` exists, `delete entity.coa.x`
        and `delete entity.coa.y`. If absent, no-op.
      - Best-effort `COArenderer.trigger("<type>COA<i>", entity.coa)`
        when `entity.coa` is defined; wrap in try/catch.
  - `createSetEmblemPositionTool(runtime)`:
    - schema as documented (`x` and `y` both required, type
      `["number", "null"]`).
    - validates entity_type → entity ref → x/y combination.
    - rounds x/y to 2 decimals before calling apply (SET path).
    - Returns
      `{ ok: true, entity_type, entity: { i, name }, previous_x, previous_y, x, y }`.
- [ ] Create `src/ai/tools/set-emblem-position.test.ts` covering all
      39 tests.
- [ ] Modify `src/ai/index.ts`:
  - Add import in alphabetical order. `position` < `shield` < `size`,
    so the new line slots BEFORE `setEmblemShieldTool`.
  - Add re-export block before the `setEmblemShieldTool` re-export.
  - Add `registry.register(setEmblemPositionTool)` adjacent to the
    other emblem registrations.

## 7. Verify green
- [ ] `npm test`.
- [ ] `npx tsc --noEmit`.
- [ ] `npm run lint`.

## 8. Commit
- [ ] Stage and commit on `plan-348-set-emblem-position`. Do NOT push.

## 9. Final report
- [ ] commit SHA, npm test summary, lint summary, tsc result, open
      issues.
