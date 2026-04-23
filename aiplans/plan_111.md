# Plan 111 — set_style_preset AI tool

## Use case

The Options panel has a Style Preset selector
(`public/modules/ui/style-presets.js:139`) that switches
the map's visual theme. The built-in presets are:

- default, ancient, gloom, pale, light, watercolor,
  clean, atlas, darkSeas, cyberpunk, night, monochrome

Changing the preset runs `changeStyle(preset)` which:

1. Fetches the preset's style JSON.
2. Applies style to every SVG element.
3. Re-renders burg icons and labels if their layers
   are on.

The AI chat has no way to change the map theme.

## Scope

Add one tool: `set_style_preset(preset)`.

- `preset` — one of the 12 system presets
  (case-insensitive; canonicalized). Custom presets
  (stored as `fmgStyle_*` in localStorage) are out of
  scope — this tool is for the fixed system list.
- Delegates to `window.changeStyle(preset)` — an
  async function, so we await it.
- Errors clearly when changeStyle is not available.

## Implementation

1. **New file `src/ai/tools/set-style-preset.ts`**:
   - Imports: errorResult, getGlobal, okResult from
     `./_shared`.
   - `STYLE_PRESETS` readonly tuple of 12 names.
   - `resolveStylePreset(value)` — case-insensitive
     lookup.
   - `StylePresetRuntime { apply }` — async call to
     changeStyle.
   - `defaultStylePresetRuntime.apply` — get
     `changeStyle` global; throw if missing; await it.
   - Schema: `preset` (string enum, required).

2. **Register** in `src/ai/index.ts`.

3. **Tests** `set-style-preset.test.ts`:
   - `resolveStylePreset` case-insensitive
     canonicalization.
   - Unit (stubbed):
     - delegates to runtime.apply
     - canonicalizes case of input
     - rejects unknown preset
     - rejects empty / non-string
     - surfaces runtime errors
   - Integration:
     - stubs globalThis.changeStyle.
     - asserts called with the canonical preset.
     - errors when changeStyle missing.

4. **README_AI.md** — row near
   `apply_layers_preset`.

## Verification

- `npm test -- --run src/ai/tools/set-style-preset`
  green.
- `npm test -- --run` — 1359 before.
- `npm run lint` — 7 / 1.
- `npm run build` — succeeds.

## Success criteria

- Tool callable, wired, documented.
- Validates against the 12 system presets.
- Delegates to window.changeStyle.
- Errors clearly when changeStyle missing.
