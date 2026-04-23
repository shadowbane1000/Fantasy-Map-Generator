# Tasks 82 — set_burg_feature AI tool

- [ ] Create `src/ai/tools/set-burg-feature.ts`:
  - Exports `BURG_FEATURES = ["citadel","walls","plaza",
    "temple","shanty"] as const`.
  - Exports `BurgFeature` type = element of BURG_FEATURES.
  - Exports `resolveBurgFeature(value) -> BurgFeature | null`
    via `createAliasResolver`. Accept plurals and simple
    synonyms. Do NOT accept `port` or `capital`.
  - Exports `BurgFeatureRef { i, name, feature, previousEnabled }`.
  - Exports `BurgFeatureRuntime { find, apply }`.
  - `defaultBurgFeatureRuntime.find(ref, feature)`:
    - Find burg via `findEntityByRef(getPackCollection("burgs"), ref)`.
    - Guard: `i > 0` (reject burg 0).
    - previousEnabled = `!!(burg?.[feature])`.
    - Return `{ i, name, feature, previousEnabled }` or null.
  - `defaultBurgFeatureRuntime.apply(i, feature, enabled)`:
    - Get `pack.burgs`; throw if missing.
    - Find burg by i; throw if missing.
    - Write `(burg as RawBurg)[feature] = enabled ? 1 : 0`.
  - Exports `createSetBurgFeatureTool(runtime?)` and
    `setBurgFeatureTool`.
  - Tool name: `set_burg_feature`.
  - Description: references Burg Editor, lists the five
    supported features, notes port / capital are NOT
    supported here.
  - Schema: `burg` (int|string, required), `feature`
    (string enum — listing the 5 canonical names,
    required), `enabled` (boolean, required).
  - Validation:
    - parseEntityRef(burg)
    - resolveBurgFeature(feature) — error message names
      the 5 supported features + mentions that port and
      capital are not supported by this tool.
    - typeof enabled === "boolean".
  - Noop path: `previousEnabled === enabled`.
  - Return payload: `{ i, name, feature, enabled,
    previousEnabled, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - `import { setBurgFeatureTool } from "./tools/set-burg-feature";`
    (placed between set-burg-culture and set-burg-population
    alphabetically).
  - Barrel re-export block for `createSetBurgFeatureTool`,
    `resolveBurgFeature`, `setBurgFeatureTool`,
    `type BurgFeature`, `type BurgFeatureRef`,
    `type BurgFeatureRuntime`, `BURG_FEATURES`.
  - `registry.register(setBurgFeatureTool)` next to other
    `setBurg*Tool` registrations.

- [ ] Write `src/ai/tools/set-burg-feature.test.ts`:
  - `resolveBurgFeature` describe:
    - canonicalizes "Citadel", "WALLS", "plaza", etc.
    - returns null for "port", "capital", "temples"
      (or — if we include plural `temples` as alias —
      adjust test accordingly).
    - returns null for non-string / unknown.
  - `set_burg_feature tool` describe with stubbed runtime:
    - sets citadel on by numeric id
    - sets walls by case-insensitive name
    - disables a feature (sets to false)
    - noop when already at target
    - rejects unknown feature ("port")
    - rejects unknown burg (find returns null)
    - rejects invalid burg refs (list of bad values)
    - rejects non-boolean enabled
    - surfaces runtime failures
  - `defaultBurgFeatureRuntime (integration)`:
    - stubs `globalThis.pack = { burgs: [...] }`.
    - writes feature via `setBurgFeatureTool.execute`.
    - verifies `pack.burgs[i].feature` becomes 1 / 0 as
      appropriate.
    - verifies rejects burg 0.

- [ ] Update `README_AI.md`: add a row for
  `set_burg_feature` near `set_burg_type`.

- [ ] Run `npm test -- --run` — all tests pass.

- [ ] Run `npm run lint` — still 7 warnings / 1 info.

- [ ] Run `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_burg_feature tool`.

## Verification: tasks → plan

- File exports + registration → "tool registered and
  callable".
- Feature enum only includes the 5 simple flags →
  "port / capital rejected".
- Apply writes `enabled ? 1 : 0` → "matches UI".
- No recalc / redraw call → "no redraw side effect".

## Verification: plan → use case

- UI handler does `burg[feature] = value` (0/1) → tool's
  apply does the same.
- Resolver matches the user-visible button labels.
- Idempotency matches button behavior (clicking an already-
  inactive feature with `enabled: false` is a noop in the
  UI too).

## Verification: tests → catch regressions

- If apply wrote `true`/`false` instead of 1/0, the
  integration assertion (`pack.burgs[i].feature === 1`)
  would fail.
- If apply wrote the wrong feature, the integration test
  would fail because the specific field wouldn't change.
- If the enum allowed "port", the rejection test would
  fail.
- If noop path was removed, the noop test would fail.
- If validation loosened on enabled, the non-boolean test
  would fail.
