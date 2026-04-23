# Tasks 122 — regenerate_all_state_names AI tool

- [ ] Create `src/ai/tools/regenerate-all-state-names.ts`:
  - Imports: errorResult, getGlobal, getPackCollection,
    okResult, RawState from `./_shared`.
  - Imports: STATE_NAME_MODES, StateNameMode,
    resolveStateNameMode from `./regenerate-state-name`.
  - Local `NamesModule` interface (getState,
    getCultureShort, getBase) — same shape as in
    `regenerate-state-name.ts`.
  - Exports:
    - `RegenerateAllStateNamesStateRef { i, name, culture,
      lock?, removed? }`.
    - `RegenerateAllStateNamesRuntime {
        list(): RegenerateAllStateNamesStateRef[];
        generate(mode, culture): string;
        apply(i, name): void;
        redraw(): void;
      }`.
    - `defaultRegenerateAllStateNamesRuntime`.
    - `createRegenerateAllStateNamesTool(runtime?)`.
    - `regenerateAllStateNamesTool`.
  - Tool name: `regenerate_all_state_names`.
  - Description: references the States Editor "Regenerate
    Names" button; culture/random modes; skips Neutrals,
    locked, removed; redraws labels once at end.
  - Schema: one optional `mode` string (enum of
    STATE_NAME_MODES).
  - execute:
    - Resolve mode via resolveStateNameMode (default
      "culture"); reject unknown with supported list.
    - Try `runtime.list()` — on error return errorResult.
    - Iterate states; skip i <= 0, removed, or lock —
      record in `skipped` with a reason.
    - For each remaining: try `runtime.generate`; if it
      throws, push skip with reason; if empty string, push
      skip with reason; else `runtime.apply(i, name)` and
      push `{ i, previousName, name }` to renamed.
    - After loop: best-effort `runtime.redraw()` inside a
      try/catch (swallow so we still return renames).
    - Return okResult with `{ mode, renamed, skipped }`.

- [ ] `defaultRegenerateAllStateNamesRuntime`:
  - `list()`: read `getPackCollection<RawState>("states")`;
    throw if undefined. Build refs skipping undefined /
    falsy entries.
  - `generate(mode, culture)`: same logic as
    `regenerate-state-name.ts` default runtime.
  - `apply(i, name)`: write `states[i].name`.
  - `redraw()`: `getGlobal<() => void>("drawStateLabels")
    ?.()`.

- [ ] Register in `src/ai/index.ts`:
  - Add import of factory + tool.
  - Add re-exports of factory + tool in the barrel (same
    style as the other `regenerate_*` re-exports).
  - `registry.register(regenerateAllStateNamesTool)` —
    immediately after `regenerateAllBurgNamesTool` for
    locality.

- [ ] Write `regenerate-all-state-names.test.ts`:
  - Unit (stubbed runtime with vi.fn):
    - default mode is culture (asserts generate called
      with "culture", apply called per eligible state,
      redraw called once).
    - explicit "RANDOM" mode resolves to "random".
    - rejects unknown mode (apply/redraw never called).
    - skips state 0 / locked / removed (appears in skipped
      with correct reason).
    - generator error for one state goes to skipped, loop
      continues, redraw still called once.
    - list-throws → errorResult, no redraw call.
  - `defaultRegenerateAllStateNamesRuntime (integration)`:
    - setup stubs `globalThis.pack`, `Names`, `nameBases`,
      `drawStateLabels`.
    - culture mode: only states i=2 and i=3 renamed;
      state 0 (Neutrals), locked, removed are preserved.
      drawStateLabels called exactly once.
    - random mode: getBase + getState called per eligible
      state; call args include the base index.
    - errors when Names is missing (returned as
      errorResult).

- [ ] Update `README_AI.md` — add row:
  - placement: directly after `regenerate_all_burg_names`
    (line 28), before `regenerate_state_name`.
  - description mirrors `regenerate_all_burg_names` but
    for states: "Bulk-regenerate names for every
    non-locked, non-removed state (skips Neutrals)…".
  - example prompts: "Reroll every state name", "Give all
    states random names (mode: random)".

- [ ] Verification:
  - `npm test -- --run src/ai/tools/regenerate-all-state-
    names` green.
  - `npm test -- --run` — 1495 before; 1495 + N after.
  - `npm run lint` — 7 warnings, 1 info, 0 errors (matches
    baseline).
  - `npm run build` — succeeds.

- [ ] Commit:
  - Stage exactly:
    - src/ai/index.ts
    - src/ai/tools/regenerate-all-state-names.ts
    - src/ai/tools/regenerate-all-state-names.test.ts
    - README_AI.md
    - aiplans/plan_122.md
    - aiplans/tasks_122.md
  - Message: `feat(ai): add regenerate_all_state_names
    tool` + 1-2 line body.

## Verification: tasks → plan

- Runtime seam mirrors `regenerate-all-burg-names` (plan's
  explicit reference).
- mode resolution reuses `resolveStateNameMode` — no
  duplicated normalization logic.
- Skip reasons: neutrals / locked / removed / generator-
  error / empty-name — covered by tests.
- Single redraw at end — tested.

## Verification: plan → use case

- UI: States Editor "Regenerate Names" button rolls fresh
  names for every non-locked state (excluding Neutrals).
  Tool produces the same side effect.

## Verification: tests → regressions

- If redraw is called per-state instead of once,
  "drawStateLabels called exactly once" integration test
  fails.
- If skip reasons are wrong or missing, unit tests fail.
- If generator errors are rethrown, "surfaces runtime
  errors" test fails.
- If state 0 isn't protected, "skips Neutrals" test
  fails.
