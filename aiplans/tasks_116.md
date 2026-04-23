# Tasks 116 — set_default_emblem_shape AI tool

- [ ] Create `src/ai/tools/set-default-emblem-shape.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    okResult.
  - Import `CULTURE_SHIELDS` from
    `./set-culture-shield`.
  - Exports:
    - `DIVERSIFORM_SHAPES = ["culture", "state",
       "random"] as const`.
    - `DEFAULT_EMBLEM_SHAPES`: frozen list of
       diversiform + specific.
    - `resolveEmblemShape(value)` — diversiform first,
      then specific CULTURE_SHIELDS; case-insensitive;
      canonicalizes to the stored casing.
    - `DefaultEmblemShapeRuntime { read, apply }`.
    - `defaultDefaultEmblemShapeRuntime`:
      - read: window.options.emblemShape → canonical or null.
      - apply(value):
        - options.emblemShape = value (if present).
        - select.value = value (if DOM present).
        - localStorage.setItem("emblemShape", value).
        - best-effort getGlobal("changeEmblemShape")?.(value).
    - `createSetDefaultEmblemShapeTool(runtime?)` and
      `setDefaultEmblemShapeTool`.
  - Tool name: `set_default_emblem_shape`.
  - Description: references Options Emblem Shape selector,
    lists the 3 diversiform + mentions all shield shapes,
    notes cascade through changeEmblemShape.
  - Schema: `shape` (string, required).
  - Validation:
    - typeof !== "string" || empty.
    - resolveEmblemShape returns null.

- [ ] Register in `src/ai/index.ts`.

- [ ] Write `set-default-emblem-shape.test.ts`.

- [ ] Update `README_AI.md`.

- [ ] `npm test -- --run` / lint / build / commit.

## Verification: tasks → plan

- File + registration = "callable".
- Diversiform + specific enum matches plan.
- Delegation to changeEmblemShape matches plan.

## Verification: plan → use case

- UI writes options.emblemShape + select + localStorage
  + calls changeEmblemShape(value). Tool does the same.

## Verification: tests → regressions

- If apply skipped localStorage / select / options, the
  integration assertions fail.
- If resolveEmblemShape dropped any diversiform name,
  canonicalization test fails.
- If changeEmblemShape wasn't called, assertion fails.
