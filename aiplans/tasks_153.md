# Tasks 153 — `add_biome`

- [ ] T1 Create `src/ai/tools/add-biome.ts` with:
  - Constants: `MIN_HABITABILITY = 0`, `MAX_HABITABILITY = 9999`, `MIN_COST = 0`, `MAX_COST = 100000`, `MIN_ICONS_DENSITY = 0`, `MAX_ICONS_DENSITY = 9999`, `MAX_BIOMES = 255`.
  - `AddBiomeInput` (name, color, habitability, cost, iconsDensity, icons) — all required at the runtime layer (tool layer applies the `iconsDensity=0` / `icons=[]` defaults before calling the runtime).
  - `NewBiome` mirrors `AddBiomeInput` plus `i: number`.
  - `AddBiomeRuntime` with a single `add(input): NewBiome` seam.
  - `defaultAddBiomeRuntime.add`:
    - Reads `globalThis.biomesData` via `getGlobal`.
    - Validates presence of each required array (`i`, `name`, `color`, `habitability`, `iconsDensity`, `icons`, `cost`); missing → throws.
    - Computes `i = biomesData.i.length`.
    - Throws if `i > MAX_BIOMES - 1` (i.e. `> 254`) — same guard as `addCustomBiome`.
    - Pushes: `i → biomesData.i`, `name → .name`, `color → .color`, `habitability → .habitability`, `iconsDensity → .iconsDensity`, `icons → .icons`, `cost → .cost`.
    - If present and `Array.isArray`, extends `rural` / `urban` / `cells` / `area` with `0` each (don't create them from scratch).
    - Returns the new biome fields.
  - `createAddBiomeTool(runtime?)` exports the tool; `addBiomeTool` default instance.
  - `input_schema` with required `name`, `color`, `habitability`, `cost`; optional `iconsDensity`, `icons`.
  - `execute`:
    - Validates `name` (non-empty string, not `"removed"`).
    - Validates `color` via `isValidCssColor` (imported from `./set-state-color`).
    - Validates `habitability` (integer in `[MIN_HABITABILITY, MAX_HABITABILITY]`).
    - Validates `cost` (integer in `[MIN_COST, MAX_COST]`).
    - If `iconsDensity` provided: integer in `[MIN_ICONS_DENSITY, MAX_ICONS_DENSITY]`; else default `0`.
    - If `icons` provided: array of non-empty trimmed strings; else default `[]`. Trim each string.
    - Calls `runtime.add(...)` inside try/catch.
    - Returns `okResult({ i, name, color, habitability, cost, iconsDensity })`.

- [ ] T2 Create `src/ai/tools/add-biome.test.ts`:
  - Injected-runtime tests (using `vi.fn<AddBiomeRuntime["add"]>`):
    1. Minimal call with the 4 required fields → runtime.add invoked with `iconsDensity: 0`, `icons: []`; result JSON matches `{ok, i, name, color, habitability, cost, iconsDensity}`.
    2. Full call preserves `iconsDensity` and `icons`.
    3. Trims strings on `name`, `color`, and individual `icons` entries.
    4. Rejects missing / empty / whitespace `name`, and `name === "removed"`.
    5. Rejects missing `color`, non-string, invalid CSS color.
    6. Rejects `habitability` out of range or non-integer.
    7. Rejects `cost` out of range or non-integer.
    8. Rejects `iconsDensity` out of range or non-integer (when provided).
    9. Rejects `icons` non-array or containing non-string / empty-string entries.
   10. runtime.add throwing → errorResult surfaces the message, `ok: false`.
  - `defaultAddBiomeRuntime` (integration) block using `as unknown as { ... }` globalThis casts:
    - Install biomesData with 13 defaults (incl. `iconsDensity`, `icons` arrays and `rural`/`urban`/`cells`/`area` pre-sized to 13).
    - Minimal add appends `i: 13`, extends every array; stat arrays each get a `0`.
    - Second add appends `i: 14` keeping arrays aligned.
    - Explicit `iconsDensity` / `icons` values preserved.
    - When `rural`/`urban`/`cells`/`area` are absent the add still succeeds and doesn't create them.
    - Missing `biomesData` → error.
    - Missing `biomesData.i` (or other required array) → error.
    - Cap: when `biomesData.i.length === 255` the add errors and no array is mutated.

- [ ] T3 Register in `src/ai/index.ts`:
  - Add `import { addBiomeTool } from "./tools/add-biome";` alphabetically at the top of the other `add-*` imports (before `addBurgTool`).
  - Add `createAddBiomeTool` / `addBiomeTool` re-export block alphabetically before the `addBurgTool` export block.
  - Add `registry.register(addBiomeTool);` in the add-tools registration section (near `addZoneTool`).

- [ ] T4 Add a `README_AI.md` row immediately above the existing `remove_biome` row, citing the parallel arrays mutated, the 255 cap, and the `iconsDensity` / `icons` defaults. Include the shared "Requires an Anthropic API key (see 'Getting an API key' below)" callout used by other add-* tools.

- [ ] T5 Verify:
  - Lint baseline before: `npm run lint 2>&1 | tail -5` — 7 warnings / 1 info / 0 errors.
  - After: `npm run build` succeeds, `npm test` all pass, `npm run lint` matches baseline.

- [ ] T6 Commit with `feat(ai): add add_biome tool` staging only the four touched files (add-biome.ts, add-biome.test.ts, src/ai/index.ts, README_AI.md) plus the two new aiplans files.
