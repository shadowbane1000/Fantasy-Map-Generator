# Tasks 62 — set_biome_color AI tool

## Task 1 — Implement tool

- [ ] `src/ai/tools/set-biome-color.ts`:
  - Imports: `errorResult`, `getGlobal`, `okResult`;
    `isValidCssColor` from `./set-state-color`; `findBiomeByRef`
    from `./rename-biome`.
  - Types:
    - `BiomeColorRef { i, name, previousColor }`.
    - `BiomeColorRuntime { find(ref), applyColor(id, color) }`.
  - `defaultBiomeColorRuntime.find(ref)`:
    - `findBiomeByRef` against `globalThis.biomesData`.
    - Return `{ i: res.id, name: res.name, previousColor:
      biomesData.color?.[res.k] ?? null }`.
  - `defaultBiomeColorRuntime.applyColor(id, color)`:
    - refind; throw if null; `biomesData.color[k] = color`.
    - If `document` present: `#biome{id}` setAttribute("fill",
      color), setAttribute("stroke", color). Safe if element
      missing.
  - Tool schema: `biome` (int|string required), `color` (string
    required).
  - Execute: validate biome ref (int ≥ 0 OR non-empty string);
    `isValidCssColor`; `runtime.find` → 404; try `applyColor`;
    return `{ i, name, previousColor, color }`.

## Task 2 — Register

- [ ] Import in `src/ai/index.ts`.
- [ ] Barrel re-export `createSetBiomeColorTool`,
  `setBiomeColorTool`.
- [ ] `registry.register(setBiomeColorTool)` after
  `renameBiomeTool`.

## Task 3 — Tests

- [ ] `src/ai/tools/set-biome-color.test.ts`:
  - Runtime-injected:
    - Recolor by numeric id.
    - Recolor by case-insensitive name.
    - Reject invalid biome refs.
    - Reject invalid colors (loop).
    - Accept every canonical color form (hex, rgb, hsl, named).
    - Error on unknown biome.
    - Surface runtime failures.
  - Default-runtime integration:
    - Stub `globalThis.biomesData` with `{ i:[0,1,2,3], name:
      ["Marine","Hot desert","removed","Savanna"], color:
      ["#466eab","#fbe79f","","#d2d082"] }`.
    - Stub `globalThis.document` with fake `#biome1` +
      setAttribute spy.
    - Recolor biome 1 to "#ff9933" → `biomesData.color[1]` ===
      "#ff9933"; setAttribute called with fill + stroke.
    - Recolor removed biome (id 2) → error, color untouched.
    - When SVG element absent → still succeeds, color data written.

## Task 4 — README

- [ ] Row under `rename_biome`:
  ```
  | `set_biome_color`       | Recolor a biome (writes `biomesData.color[k]` and refreshes the `#biome{i}` SVG fill + stroke — same side-effect as the Biomes Editor swatch). Matches by id (0 = Marine) or case-insensitive name. Accepts hex / rgb / rgba / hsl / hsla / named CSS colors. Removed biomes (name slot = "removed") are skipped. | "Make Hot desert #ff9933", "Recolor biome 5 to teal" |
  ```

## Task 5 — Verify

- [ ] `npm test -- --run src/ai/tools/set-biome-color` passes.
- [ ] `npm test -- --run` full suite passes.
- [ ] `npm run lint` 7/1 baseline.
- [ ] `npm run build` succeeds.

## Task 6 — Commit

- [ ] `feat(ai): add set_biome_color tool`.

## Verification that tasks accomplish the plan

- Plan step 1 → Task 1.
- Plan step 2 → Task 2.
- Plan step 3 → Task 3.
- Plan step 4 → Task 4.
- Plan "Verification" → Task 5.

## Verification that plan accomplishes the use case

- Use case: Biomes Editor swatch writes; AI can't recolor.
- Plan writes the same `biomesData.color[k]` and updates the same
  `#biome{id}` fill + stroke attributes the editor's callback
  uses. Overlay updates identically to a user-driven swatch click.
- "removed" sentinel skipped, consistent with `rename_biome`.

## Verification that tests prove the use case

- Injected-runtime tests cover validation + dispatch.
- Integration test asserts both the data mutation AND the DOM
  attribute updates — the exact two side-effects the UI produces.
- `isValidCssColor` is already unit-tested elsewhere, so we
  smoke-test its wiring only.
