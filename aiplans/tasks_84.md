# Tasks 84 — set_culture_shield AI tool

- [ ] Create `src/ai/tools/set-culture-shield.ts`:
  - Import `shields` from `../../modules/emblem/shields`.
  - Build canonical list at module load: iterate
    `Object.keys(shields)` excluding "types", flatten
    `Object.keys(shields[type])`, dedupe, sort stably.
  - Export `CULTURE_SHIELDS: readonly string[]`.
  - Build lower-case → canonical lookup map.
  - Export `resolveCultureShield(value) -> string | null`.
  - Export `CultureShieldRef { i, name, previousShield }`.
  - Export `CultureShieldRuntime`:
    ```
    find(ref: number | string): CultureShieldRef | null;
    apply(i: number, shape: string):
      { states: number; provinces: number; burgs: number };
    ```
  - `defaultCultureShieldRuntime`:
    - `find`: findEntityByRef over `cultures` (allows
      culture 0 / Wildlands). Reject removed cultures
      (match UI — Wildlands is typically marked removed
      but still selectable; actually the UI allows
      selecting shield for any culture including id 0 if
      shown in the list. We'll accept culture 0).
      → return `{ i, name, previousShield: shield ?? "" }`.
    - `apply(i, shape)`:
      - Read pack.cultures, pack.states, pack.provinces,
        pack.burgs, pack.cells.culture (all may be
        undefined → throw with a clear message).
      - Write `pack.cultures[i].shield = shape`.
      - Walk `pack.states`: skip entries without `i`, with
        `removed`, without `coa`, with `coa.custom`.
        Skip if `state.culture !== i`. If
        `state.coa.shield === shape`, skip. Else write
        it and increment counter.
      - Walk `pack.provinces`: skip entries without `i`,
        with `removed`, without `coa`, with `coa.custom`.
        Compute `cultureOf = pack.cells?.culture?.[province.center]`.
        If `cultureOf !== i`, skip. Else compare and
        assign similarly.
      - Walk `pack.burgs`: skip entries without `i`, with
        `removed`, without `coa`, with `coa.custom`. If
        `burg.culture !== i`, skip. Else compare and
        assign.
      - Return the three counts.
  - Export `createSetCultureShieldTool(runtime?)` and
    `setCultureShieldTool`.
  - Tool name: `set_culture_shield`.
  - Description: mentions Cultures Editor shield
    dropdown, the cascade to non-custom state/province/
    burg coas, and that existing COA renderings are not
    refreshed (data-layer only).
  - Schema: `culture` (int|string required), `shield`
    (string required).
  - Validation:
    - parseEntityRef.
    - typeof shield !== "string" / empty.
    - resolveCultureShield → include `supported` in
      error body.
  - Noop when `previousShield === canonicalShape` AND
    `cascaded.states + cascaded.provinces + cascaded.burgs
    === 0`.

  Implementation trick: apply returns counts AND can
  optionally be called even when previousShield matches —
  because the UI cascade runs unconditionally, an AI
  tool call with the same shape but cascade mismatch
  should still "heal" the cascade. So we always call
  apply if reached, then noop label is computed from
  counts + previousShield.

- [ ] Register in `src/ai/index.ts`:
  - Import near other `set-culture-*`.
  - Barrel re-export: `createSetCultureShieldTool`,
    `resolveCultureShield`, `setCultureShieldTool`,
    `CULTURE_SHIELDS`, `type CultureShieldRef`,
    `type CultureShieldRuntime`.
  - `registry.register(setCultureShieldTool)` near other
    `setCulture*Tool`.

- [ ] Write `src/ai/tools/set-culture-shield.test.ts`:
  - `resolveCultureShield` describe: 3+ tests.
  - `CULTURE_SHIELDS` describe: excludes "types";
    includes known keys.
  - `set_culture_shield tool` describe with stubbed
    runtime:
    - sets by numeric id
    - sets by case-insensitive culture name
    - canonicalizes lowercase shield
    - rejects unknown shield (error, no apply call)
    - rejects unknown culture
    - rejects invalid refs
    - noop when apply returns all-zero counts and
      previousShield matches
    - non-noop when cascade occurred (counts > 0)
    - surfaces runtime errors
  - `defaultCultureShieldRuntime (integration)`:
    - stubs globalThis.pack with cultures / states /
      provinces / burgs / cells.culture.
    - asserts culture.shield written
    - asserts state.coa.shield cascades
    - asserts province.coa.shield cascades via
      cells.culture[center]
    - asserts burg.coa.shield cascades
    - asserts custom coas are skipped (stays unchanged)
    - asserts removed entities are skipped
    - asserts mismatched-culture entities unchanged

- [ ] Update `README_AI.md`: add a row near
  `set_culture_type`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 warnings / 1 info.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_culture_shield tool`.

## Verification: tasks → plan

- File layout, validation, cascade, counts → match
  plan.
- Noop semantics match the plan's "cascade also runs
  unconditionally" clause via recomputing noop from
  counts.

## Verification: plan → use case

- UI writes culture.shield + cascades to three entity
  types. Tool does the same three mutations.
- UI skips custom coas and removed entities — tool does
  too.
- UI re-renders DOM; tool doesn't (data-layer only).
  Documented tradeoff — AI doesn't drive editor panels.

## Verification: tests → regressions

- Integration test asserts pack mutation on all 4
  collections (cultures, states, provinces, burgs) —
  catches miswrites.
- Custom-coa skip assertion catches a regression that
  would blow away user-customized emblems.
- Removed-entity skip assertion catches a regression
  that would cascade into zombie records.
- Mismatched-culture skip assertion catches a regression
  that would indiscriminately overwrite.
- Noop assertion catches a regression in the idempotency
  computation.
- Cascade-mismatch healing assertion ensures apply is
  always called (instead of early-returning when
  previousShield matches).
