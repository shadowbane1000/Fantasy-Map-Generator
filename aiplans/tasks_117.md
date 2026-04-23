# Tasks 117 — regenerate_burg_name AI tool

- [ ] Create `src/ai/tools/regenerate-burg-name.ts`:
  - Imports from `./_shared`: errorResult,
    findEntityByRef, getGlobal, getPackCollection,
    okResult, parseEntityRef, type RawBurg.
  - Exports:
    - `BURG_NAME_MODES = ["culture", "random"] as const`.
    - `BurgNameMode` type.
    - `resolveBurgNameMode(value)`.
    - `RegenerateBurgNameRef { i, name, culture }`.
    - `RegenerateBurgNameRuntime { find, generate,
       apply }`.
    - `defaultRegenerateBurgNameRuntime`:
      - find: findEntityByRef on pack.burgs, guard
        i > 0 && !removed.
      - generate(mode, culture):
        - Read `getGlobal<NamesModule>("Names")`; throw
          if missing or missing getCulture / getBase.
        - mode=culture: Names.getCulture(culture).
        - mode=random:
          - `nameBases = getGlobal<unknown[]>("nameBases")`.
          - Throw if missing / not array.
          - Pick `rand(nameBases.length - 1)` via
            `Math.floor(Math.random() * nameBases.length)`.
          - Names.getBase(base).
      - apply(i, name):
        - Get pack.burgs; throw if missing.
        - burg.name = name.
        - Best-effort: document.getElementById
          (`burgLabel${i}`)?.textContent = name.
    - `createRegenerateBurgNameTool(runtime?)` and
      `regenerateBurgNameTool`.
  - Tool name: `regenerate_burg_name`.
  - Description: references Burg Editor regen name
    buttons, modes culture/random, updates burg.name +
    SVG label.
  - Schema: burg (int|string required), mode (string
    enum, optional, default culture).
  - Validation:
    - parseEntityRef.
    - resolveBurgNameMode on provided mode (or default
      to "culture").
    - find returns null → error.
  - Return payload: `{ i, previousName, name, mode }`.

- [ ] Register in `src/ai/index.ts`.

- [ ] Write `regenerate-burg-name.test.ts`:
  - `resolveBurgNameMode` canonicalization.
  - Unit (stubbed):
    - default mode = culture
    - explicit random
    - rejects unknown mode
    - rejects invalid refs / unknown burg
    - surfaces runtime errors
  - Integration:
    - stubs pack.burgs, Names (getCulture/getBase),
      nameBases (length 5), document.
    - default mode: Names.getCulture called with
      burg.culture; burg.name updated; label
      textContent updated.
    - random: Names.getBase called with a number in
      [0, nameBases.length - 1].
    - errors when Names missing.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` / lint / build / commit.

## Verification: tasks → plan

- File + registration = "callable".
- Two modes with Names delegation match plan.

## Verification: plan → use case

- UI re-random / re-culture buttons both call
  Names.getBase / Names.getCulture. Tool delegates to
  the same module.

## Verification: tests → regressions

- If apply doesn't update burg.name, integration
  fails.
- If label SVG update is dropped, label assertion
  fails.
- If Names missing isn't caught, the error test
  fails.
