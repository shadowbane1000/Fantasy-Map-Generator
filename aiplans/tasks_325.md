# Tasks 325: `set_namesbase_multiword_rate` tool

## 1. Lint baseline (done)

- [x] Run `npm run lint 2>&1 | tail -40` and record the existing
      warnings as the baseline (7 warnings, 1 info, 0 errors). See
      `aiplans/plan_325.md` § "Lint baseline".

## 2. Plan + self-review (done)

- [x] Author `aiplans/plan_325.md`.
- [x] Author `aiplans/tasks_325.md` (this file).
- [x] Self-review section appended to plan.

## 3. Implement `src/ai/tools/set-namesbase-multiword-rate.ts`

- [ ] Imports: `errorResult`, `getGlobal`, `okResult` from `./_shared`;
      `Tool`, `ToolResult` from `./index`; `findNamesbaseByIndex`,
      `findNamesbasesByName`, `NamesbaseRenameRef` from
      `./rename-namesbase`.
- [ ] `interface NameBaseLike { name?: unknown; m?: unknown }`.
- [ ] `interface SetNamesbaseMultiwordRateRuntime` with
      `getNameBases(): NameBaseLike[]` and
      `setMultiwordRate(index: number, value: number): void`.
- [ ] `getNameBasesOrThrow()` helper that throws when global missing.
- [ ] `defaultSetNamesbaseMultiwordRateRuntime` writing
      `nameBases[index].m = value` after validating the index slot.
- [ ] `readExistingMultiwordRate(value: unknown): number` returning the
      number when finite, else `0`.
- [ ] `createSetNamesbaseMultiwordRateTool(runtime?)` returning a
      `Tool` named `set_namesbase_multiword_rate` with full description
      and JSON schema (per plan).
- [ ] Validation order:
      1. `multiword_rate` is `typeof === "number"` AND
         `Number.isFinite` else `"multiword_rate must be a finite
         number."`.
      2. `multiword_rate >= 0 && <= 1` else
         `"multiword_rate must be in [0, 1]."`.
      3. At least one of `index`/`current_name` (else single error).
      4. `index` non-negative integer, when present.
      5. `current_name` non-empty trimmed string, when present.
      6. Resolve `bases` via `runtime.getNameBases()` (catch & surface).
      7. Apply `findNamesbaseByIndex` and/or `findNamesbasesByName`.
      8. Disagree check; ambiguous check; not-found check.
      9. Read `oldValue = readExistingMultiwordRate(entry.m)`.
      10. Call `runtime.setMultiwordRate(target.index, multiword_rate)`
          (catch & surface).
      11. Return `okResult({ ok, index, name, old_multiword_rate,
          new_multiword_rate })`.
- [ ] Export `setNamesbaseMultiwordRateTool =
      createSetNamesbaseMultiwordRateTool()`.

## 4. Tests `src/ai/tools/set-namesbase-multiword-rate.test.ts`

- [ ] `makeRuntime(overrides?)` helper using `vi.fn`, mirroring
      duplication test.
- [ ] Tests (per plan §Tests 1-17): happy path; boundary 0; boundary
      1; old defaults to 0 when missing; out-of-range rejected (-0.01,
      1.01, -1, 2); non-finite rejected; non-number rejected
      (string, null, true, {}, []); missing input; index out-of-range;
      bad index types; current_name not found; ambiguous; disagree;
      neither id; bad current_name; runtime errors; integration with
      `globalThis.nameBases`; missing/non-array `nameBases`; registry
      round-trip; tool name + required schema check.

## 5. Wire into `src/ai/index.ts`

- [ ] Add `import { setNamesbaseMultiwordRateTool } from
      "./tools/set-namesbase-multiword-rate";` between
      `setNamesbaseLengthRangeTool` and `setNamesbaseNamesTool` imports.
- [ ] Add re-export block (createTool, defaultRuntime, type, tool)
      between the corresponding `set-namesbase-length-range` and
      `set-namesbase-names` re-export blocks.
- [ ] Add `setNamesbaseMultiwordRateTool,` to the tools list/array
      between the LengthRange and Names entries.
- [ ] Add `registry.register(setNamesbaseMultiwordRateTool);` adjacent
      to the other namesbase setter registrations.

## 6. Verify

- [ ] `npm test` — green.
- [ ] `npm run lint 2>&1 | tail -40` — still 7 warnings, 1 info, 0
      errors. No new noise.
- [ ] `npx tsc --noEmit` — clean.

## 7. Commit

- [ ] Stage only:
      `src/ai/tools/set-namesbase-multiword-rate.ts`,
      `src/ai/tools/set-namesbase-multiword-rate.test.ts`,
      `src/ai/index.ts`,
      `aiplans/plan_325.md`,
      `aiplans/tasks_325.md`.
- [ ] Commit message: `feat(ai): add set_namesbase_multiword_rate tool`.
- [ ] Do NOT commit `.claude/`, `current-ralph-loop.prompt`, `temp/`,
      or pre-existing dirty files.
- [ ] Do NOT push.
