# Tasks 101 — regenerate_emblems AI tool

- [ ] Create `src/ai/tools/regenerate-emblems.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    getPackCollection, okResult, types RawBurg,
    RawProvince, RawState.
  - Exports:
    - `RegenerateEmblemsCounts { states, burgs, provinces }`.
    - `RegenerateEmblemsRuntime { regenerate, counts }`.
    - `defaultRegenerateEmblemsRuntime`:
      - regenerate: get `regenerateEmblems` global; throw
        a clear error if missing; call it.
      - counts: count active state / burg / province
        entries (i > 0 && !removed) from pack.
    - `createRegenerateEmblemsTool(runtime?)` and
      `regenerateEmblemsTool`.
  - Tool name: `regenerate_emblems`.
  - Description: references Tools panel Regenerate
    Emblems button, notes it rebuilds all state / burg /
    province coats of arms from scratch.
  - Schema: empty object, no required fields.
  - Execute:
    - Read counts BEFORE regenerating (the function
      itself doesn't add or remove entities — it replaces
      coas — so counts are stable).
    - Call runtime.regenerate().
    - Return payload: `{ states, burgs, provinces }`.

- [ ] Register in `src/ai/index.ts`:
  - Import after `regenerateMapTool`.
  - Barrel re-export.
  - `registry.register(regenerateEmblemsTool)`.

- [ ] Write `src/ai/tools/regenerate-emblems.test.ts`:
  - Unit (stubbed):
    - calls runtime.regenerate, reports counts.
    - surfaces runtime errors.
  - `defaultRegenerateEmblemsRuntime (integration)`:
    - stubs pack with active+removed entities.
    - stubs `globalThis.regenerateEmblems = vi.fn()`.
    - asserts regenerateEmblems was called.
    - counts only include active entities (removed
      skipped).
    - errors when regenerateEmblems missing.

- [ ] Update `README_AI.md` — row near `regenerate_map`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add regenerate_emblems tool`.

## Verification: tasks → plan

- File + registration cover "callable".
- Counts match the plan's reporting requirement.
- Error path matches plan.

## Verification: plan → use case

- UI button calls window.regenerateEmblems; tool
  delegates to the same global.
- Counts give the AI feedback on how many coas were
  touched.

## Verification: tests → regressions

- If regenerate wasn't called, the mock assertion
  fails.
- If removed entities slipped into counts, the
  integration test fails.
- If error path is lost, the missing-function test
  fails.
