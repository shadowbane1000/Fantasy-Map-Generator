# Tasks 111 — set_style_preset AI tool

- [ ] Create `src/ai/tools/set-style-preset.ts`:
  - Imports from `./_shared`: errorResult, getGlobal,
    okResult.
  - Exports:
    - `STYLE_PRESETS` readonly tuple:
      ```
      ["default", "ancient", "gloom", "pale", "light",
       "watercolor", "clean", "atlas", "darkSeas",
       "cyberpunk", "night", "monochrome"]
      ```
    - `StylePreset` type.
    - `resolveStylePreset(value)` — case-insensitive
      lookup returning canonical name or null.
    - `StylePresetRuntime { apply(preset: StylePreset):
       Promise<void> | void }`.
    - `defaultStylePresetRuntime`:
      - apply: get `changeStyle` global; throw if
        missing; await the returned promise.
    - `createSetStylePresetTool(runtime?)` and
      `setStylePresetTool`.
  - Tool name: `set_style_preset`.
  - Description: references Options panel Style
    Preset selector, lists 12 system presets, notes
    custom presets not supported here.
  - Schema: `preset` (string enum [...STYLE_PRESETS],
    required).
  - Validation:
    - typeof preset !== "string" || empty → error +
      supported list.
    - resolveStylePreset returns null → error +
      supported list.
  - Return payload: `{ preset: canonical }`.

- [ ] Register in `src/ai/index.ts`:
  - Import after other set-* tools.
  - Barrel re-export: `createSetStylePresetTool`,
    `STYLE_PRESETS`, `resolveStylePreset`,
    `setStylePresetTool`.
  - `registry.register(setStylePresetTool)`.

- [ ] Write `src/ai/tools/set-style-preset.test.ts`:
  - `resolveStylePreset` canonicalization tests.
  - Unit (stubbed runtime):
    - delegates with canonical preset
    - canonicalizes case
    - rejects unknown
    - rejects empty / non-string
    - surfaces runtime errors
  - `defaultStylePresetRuntime (integration)`:
    - stubs `globalThis.changeStyle` as an async vi.fn.
    - apply called with canonical preset.
    - errors when changeStyle missing.

- [ ] Update `README_AI.md` — row near
  `apply_layers_preset`.

- [ ] `npm test -- --run` — all pass.

- [ ] `npm run lint` — still 7 / 1.

- [ ] `npm run build` — succeeds.

- [ ] Commit: `feat(ai): add set_style_preset tool`.

## Verification: tasks → plan

- File + registration covers "callable".
- Preset enum matches plan's 12 names.
- Async delegation matches plan.

## Verification: plan → use case

- UI: changeStyle(preset) — tool does the same.
- Custom presets out of scope; AI can still switch
  between system themes.

## Verification: tests → regressions

- If canonicalization drops a preset, that test
  fails.
- If delegation dropped, integration assertion
  fails.
- If missing-changeStyle not caught, that test
  fails.
