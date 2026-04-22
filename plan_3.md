# Plan 3 — Use Case: Apply a layer preset

## Status

Iteration 3 of the Ralph loop. Previous iterations delivered:
- The chat window infra + `set_map_name`.
- `set_layer_visibility` for single-layer toggles.

Baseline remains 7 lint warnings / 1 info / 0 errors. 88 tests pass.

## Use Case

**"Apply a named map preset (political, cultural, religions, ...)".**

`public/modules/ui/layers.js` exposes a dropdown `#layersPreset` with the
built-in presets `political`, `cultural`, `religions`, `provinces`,
`biomes`, `heightmap`, `physical`, `poi`, `military`, `emblems`,
`landmass`, plus any user-saved custom presets. Picking one in the UI
calls `handleLayersPresetChange(preset)` which clicks the layer toggles
needed to match the preset.

Users ask:
- *"Show me a political map"*
- *"Switch to the physical view"*
- *"Give me the religions preset"*

### Success criteria

1. `"show me a political map"` → `handleLayersPresetChange("political")`
   is called with that exact string.
2. Unknown preset names return a structured error listing the supported
   presets.
3. Friendly aliases (`"political map"`, `"religion"`, `"heightmap view"`)
   normalize to canonical preset names.
4. If the app hasn't finished loading (the preset change function isn't
   on `window` yet), the tool returns an error message explaining that.

## Scope

In-scope:
- New tool `apply_layers_preset({preset: string})`.
- Alias/normalization table for the 11 default presets.
- Registry wiring in `src/ai/index.ts`.
- Unit tests.
- README_AI.md tool-table entry.

Out-of-scope:
- Saving/removing custom presets (future tool).
- Reading the current preset back.

## Design

New file: `src/ai/tools/apply-layers-preset.ts`.

Canonical presets and aliases:

| Canonical   | Aliases                                                          |
| ----------- | ---------------------------------------------------------------- |
| political   | political, politics, states, political map, political view       |
| cultural    | cultural, culture, cultures, culture map                         |
| religions   | religions, religion, religion map, religious                     |
| provinces   | provinces, province, province map                                |
| biomes      | biomes, biome, biome map, ecology                                |
| heightmap   | heightmap, height, elevation, topographic                        |
| physical    | physical, physical map, geography                                |
| poi         | poi, points of interest, markers view                            |
| military    | military, military map, army map                                 |
| emblems     | emblems, heraldry, coats of arms                                 |
| landmass    | landmass, land mass, land only, minimalist, minimal              |

### Runtime seam

```ts
export interface PresetRuntime {
  apply(presetName: string): void;
}
export const defaultPresetRuntime: PresetRuntime = {
  apply(name) {
    const fn = (globalThis as any).handleLayersPresetChange;
    if (typeof fn !== "function")
      throw new Error("handleLayersPresetChange is not available yet.");
    fn(name);
  },
};
export function createApplyLayersPresetTool(
  runtime = defaultPresetRuntime,
): Tool { ... }
```

The tool:
1. Validates input is a non-empty string.
2. Lowercases/trims and looks up in the alias → canonical map.
3. Returns a structured error with the supported list if unknown.
4. Calls `runtime.apply(canonical)` and returns `{ok: true, preset}`.

## Files

Create:
- `plan_3.md`, `tasks_3.md`.
- `src/ai/tools/apply-layers-preset.ts`.
- `src/ai/tools/apply-layers-preset.test.ts`.

Modify:
- `src/ai/index.ts` (register + export).
- `README_AI.md` (tool table row).

## Testing plan

Unit (`src/ai/tools/apply-layers-preset.test.ts`):

1. `{preset: "political"}` → `apply("political")` called with that
   canonical name.
2. `{preset: "culture map"}` → alias maps to canonical `"cultural"`.
3. `{preset: "xyz"}` → `{isError: true}`, body contains the supported
   list with `"political"` among the entries.
4. Missing/empty preset → error.
5. Runtime throws → tool returns `{isError: true}` containing the error
   message.
6. Case-insensitive: `"PHYSICAL"` works.

## Plan ↔ tasks ↔ tests verification

| Criterion           | Implementation        | Test |
| ------------------- | --------------------- | ---- |
| #1 canonical call   | alias map + runtime   | Test 1, 2, 6 |
| #2 structured error | alias lookup fallback | Test 3, 4 |
| #3 aliases          | alias map             | Test 2 |
| #4 not-loaded error | runtime throws        | Test 5 |

Lint/test/build gates enforced by tasks 6–8 in `tasks_3.md`.
