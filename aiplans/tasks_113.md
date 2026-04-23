# Tasks 113 — set_cultures_set AI tool

- [ ] Create `src/ai/tools/set-cultures-set.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    okResult.
  - Exports:
    - `CULTURES_SETS` readonly tuple (8 values).
    - `CulturesSet` type.
    - `resolveCulturesSet(value)` — case-insensitive
      canonicalization with alias map
      (`all-world` / `all` → `world`, `high fantasy`
      / `high-fantasy` → `highFantasy`, similar for
      `dark fantasy` → `darkFantasy`).
    - `CulturesSetRuntime { read, apply }`.
    - `defaultCulturesSetRuntime`:
      - read: document.getElementById("culturesSet").
        value, canonicalized via resolveCulturesSet.
      - apply: write select.value; localStorage.setItem
        ("culturesSet", value); best-effort
        `window.changeCultureSet()` call.
    - `createSetCulturesSetTool(runtime?)` and
      `setCulturesSetTool`.
  - Tool name: `set_cultures_set`.
  - Description: references Options dialog Cultures
    Set selector, lists 8 values, notes cap cascade.
  - Schema: `cultures_set` (string enum, required).
  - Validation:
    - typeof cultures_set !== "string" || empty →
      error + supported list.
    - resolveCulturesSet null → error + supported list.
  - Noop: current read matches canonical.
  - Return payload: `{ cultures_set: canonical,
    previous: <canonical or null>, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Import near setCultureShieldTool.
  - Barrel re-export.
  - `registry.register(setCulturesSetTool)`.

- [ ] Write `src/ai/tools/set-cultures-set.test.ts`:
  - `resolveCulturesSet`:
    - canonicalizes "World", "EUROPEAN",
      "darkfantasy", "highfantasy".
    - accepts aliases "all-world", "all" → "world";
      "high-fantasy" / "high fantasy" → "highFantasy";
      "dark-fantasy" / "dark fantasy" → "darkFantasy".
    - returns null for unknown / empty / non-string.
  - Unit (stubbed):
    - delegates
    - canonicalizes
    - rejects unknown
    - rejects empty/non-string
    - noop when current read returns the target
    - surfaces runtime errors
  - `defaultCulturesSetRuntime (integration)`:
    - stubs document.getElementById for the
      culturesSet select, localStorage,
      `globalThis.changeCultureSet`.
    - apply updates select.value + localStorage +
      calls changeCultureSet.
    - read returns canonicalized current value.

- [ ] Update `README_AI.md` — row near
  `set_generator_rates`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_cultures_set tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- 8 sets covered with canonicalization and aliases.
- apply pattern matches plan: select + localStorage +
  changeCultureSet.

## Verification: plan → use case

- UI writes the select value and triggers
  changeCultureSet (which caps cultures max). Tool
  does the same via DOM + best-effort global call.

## Verification: tests → regressions

- If an alias was dropped, the canonicalization test
  fails.
- If apply skipped the changeCultureSet call, the
  integration assertion fails.
- If noop path removed, the noop test fails.
