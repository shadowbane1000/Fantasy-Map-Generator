# Tasks 347: `set_emblem_size`

## 1. Read context
- [x] `CLAUDE.md`, `src/types/PackedGraph.ts`, `src/types/global.ts`,
      `src/ai/tools/index.ts`, `src/ai/tools/_shared/*`.
- [x] `src/ai/tools/set-culture-shield.ts` + `.test.ts` (per-entity setter).
- [x] `src/ai/tools/set-marker-icon-size.ts` + `.test.ts` (numeric size validator).
- [x] `src/ai/tools/regenerate-burg-coa.ts`, `regenerate-state-coa.ts`,
      `regenerate-province-coa.ts` (entity coa shapes).
- [x] `public/modules/ui/emblems-editor.js` `changeSize` (lines 180-204).
- [x] `src/index.html` line 5160 — slider `min="0" max="5" step=".1"`.

## 2. Capture lint baseline
- [x] `npm run lint 2>&1 | tail -50` — clean (recorded in plan).

## 3. Write plan_347.md
- [x] Use case + legacy reference.
- [x] Lint baseline.
- [x] Behavior, schema, validation, errors, success result.
- [x] Files, tests, verification.
- [x] Self-review section (to be filled in step 5).

## 4. Write tasks_347.md
- [x] This file.

## 5. Self-review (mandatory)
- [ ] Re-read plan_347.md and tasks_347.md.
- [ ] Verify: all three entity types tested (state/province/burg).
- [ ] Verify: `size = 0` special case tested (DOM removal, no append).
- [ ] Verify: `coa` initialization tested.
- [ ] Verify: existing `coa.shield` preservation tested.
- [ ] Verify: `previous_size` captured BEFORE mutation tested.
- [ ] Document corrections in plan_347.md "## Self-review".

## 6. Implement
- [ ] Create `src/ai/tools/set-emblem-size.ts`:
  - `EMBLEM_SIZE_MIN = 0`, `EMBLEM_SIZE_MAX = 5`.
  - `EMBLEM_ENTITY_TYPES = ["state", "province", "burg"]` (lowercase).
  - `resolveEmblemEntityType(value): "state" | "province" | "burg" | null`.
  - `EmblemSizeRef { i, name, previousSize, entityType }`.
  - `SetEmblemSizeRuntime { find(entityType, ref), apply(entityType, i, size) }`.
  - `defaultSetEmblemSizeRuntime`:
    - `find` selects from `pack.states` / `pack.provinces` / `pack.burgs`
      via `findEntityByRef`; returns `{ i, name, previousSize: entity.coa?.size ?? null }`.
    - `apply` initializes `entity.coa = entity.coa ?? {}`, writes
      `entity.coa.size`, then best-effort DOM:
      - Read `window.emblems` via `getGlobal`.
      - `g = emblems.select("#" + entityType + "Emblems")`.
      - `g.select("[data-i='<i>']").remove()`.
      - If size > 0: compute coordinates from
        `entity.coa.x ?? entity.x ?? entity.pole?.[0]` and similar for y.
        Append `<use>` with x, y, width=`<size>em`, height=`<size>em`,
        href=`#<entityType>COA<i>`. Wrap whole DOM block in
        try/catch.
  - `createSetEmblemSizeTool(runtime)`:
    - schema as documented.
    - validates entity_type, entity ref, size range.
    - Returns `{ ok: true, entity_type, entity: { i, name }, previous_size, size }`.
- [ ] Create `src/ai/tools/set-emblem-size.test.ts` covering all 30 tests.
- [ ] Modify `src/ai/index.ts`:
  - Add import in alphabetical order (between
    `setDefaultEmblemShapeTool` and `setEntityExpansionismTool`).
  - Add re-export block.
  - Add `registry.register(setEmblemSizeTool)` after the emblem-shape
    registrations.

## 7. Verify green
- [ ] `npm test`.
- [ ] `npx tsc --noEmit`.
- [ ] `npm run lint`.

## 8. Commit
- [ ] Stage and commit on `plan-347-set-emblem-size`. Do NOT push.

## 9. Final report
- [ ] commit SHA, npm test summary, lint summary, tsc result, open
      issues.
