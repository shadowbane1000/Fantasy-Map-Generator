# Plan 318: tasks

1. [x] Capture lint baseline (recorded in plan_318.md).
2. [x] Write `aiplans/plan_318.md`.
3. [x] Write `aiplans/tasks_318.md` (this file).
4. [x] Self-review plan + tasks; note review at bottom of plan_318.md.
5. [ ] Implement `src/ai/tools/set-namesbase-length-range.ts`:
   - import `errorResult`, `okResult`, `getGlobal` from `_shared`.
   - import `findNamesbaseByIndex`, `findNamesbasesByName`,
     `NamesbaseRenameRef` from `./rename-namesbase` (reusing the
     identification helpers).
   - declare local `NameBaseLike` (same shape as plan 317 but
     including `min` and `max` reads).
   - constants `MIN_LEN = 2`, `MAX_LEN = 100`.
   - export `SetNamesbaseLengthRangeRuntime` interface with
     `getNameBases()` and
     `setLengthRange(index, { min?, max? })`.
   - export `defaultSetNamesbaseLengthRangeRuntime` that uses
     `getGlobal("nameBases")` and validates the index/entry.
   - export `createSetNamesbaseLengthRangeTool(runtime?)` and
     `setNamesbaseLengthRangeTool` instance.
   - tool input schema: optional `index`, optional `current_name`,
     optional `min`, optional `max`; no `required` array (the
     execute body enforces "at least one of …").
6. [ ] Implement `src/ai/tools/set-namesbase-length-range.test.ts`
   covering the test list in plan_318.md.
7. [ ] Wire in `src/ai/index.ts`:
   - import line right after `setMeasurementUnitsTool` import.
   - export line right after the `setMeasurementUnitsTool` export.
   - registry.register call near existing namesbase / setMeasurement
     registrations.
8. [ ] Run `npm test`; fix until green.
9. [ ] Run `npx tsc --noEmit`; fix until green.
10. [ ] Run `npm run lint`; ensure no new issues vs baseline.
11. [ ] Commit with message
    `feat(ai): add set_namesbase_length_range tool`. Stage only
    the two new files and the modified `src/ai/index.ts`. Don't
    stage `.claude/`, `current-ralph-loop.prompt`, or pre-existing
    dirty `src/ai/chat-controller.ts`.
12. [ ] Report status (commit SHA, tests/tsc/lint).
