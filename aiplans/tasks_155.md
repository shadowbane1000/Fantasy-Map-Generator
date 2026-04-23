# Tasks 155 — `set_biome_icons`

- [ ] T1 Create `src/ai/tools/set-biome-icons.ts` with:
  - Imports: `errorResult`, `getGlobal`, `okResult` from `./_shared`; `Tool`, `ToolResult` from `./index`; `findBiomeByRef` from `./rename-biome`.
  - `BiomeIconsRef` interface: `{ i: number; name: string; previousIcons: string[] }`.
  - `BiomeIconsRuntime` interface: `{ find(ref): BiomeIconsRef | null; apply(id, icons): void }`.
  - `BiomesDataLike` interface: `{ i?: number[]; name?: string[]; icons?: string[][] }`.
  - `defaultBiomeIconsRuntime`:
    - `find(ref)`: resolve via `findBiomeByRef`, build `previousIcons` as a defensive copy of `biomesData.icons?.[res.k]` when that is an array, else `[]`.
    - `apply(id, icons)`: re-resolve; throw if slot or `biomesData.icons` missing / not array; write `biomesData.icons[res.k] = [...icons]`; best-effort call `getGlobal<() => void>("drawReliefIcons")` inside a try/catch.
  - `isValidRef` local helper (same shape as sibling tools: integer ≥ 0 or non-empty string).
  - `createSetBiomeIconsTool(runtime?)`: returns Tool with
    - `name: "set_biome_icons"`.
    - Description citing parallel to `set_biome_icons_density`, the flat `string[]` runtime shape, duplicates-as-weights, and that empty array is allowed. Note it writes `biomesData.icons[k]` and calls `drawReliefIcons()` best-effort.
    - `input_schema`: `biome` (integer | string) required, `icons` (array of strings) required.
    - `execute`:
      1. Validate `biome` via `isValidRef` → errorResult.
      2. Validate `icons` is an array → errorResult.
      3. Validate every entry is a non-empty trimmed string → errorResult.
      4. Normalise entries (keep as-is; do NOT trim — duplicates-as-weights contract treats strings verbatim).
      5. Call `runtime.find(biome)`; null → errorResult.
      6. Call `runtime.apply(current.i, icons)` inside try/catch; surface errors.
      7. Return `okResult({ i, name, previousIcons, icons })`.
  - Export `setBiomeIconsTool = createSetBiomeIconsTool()`.

- [ ] T2 Create `src/ai/tools/set-biome-icons.test.ts`:
  - Injected-runtime tests via `vi.fn<BiomeIconsRuntime["apply"]>`:
    1. Sets icons by numeric id.
    2. Sets by case-insensitive name.
    3. Accepts empty `icons: []`.
    4. Accepts long lists (50 entries) with duplicates.
    5. Rejects invalid `biome` refs: `null`, `undefined`, `-1`, `1.5`, `""`.
    6. Rejects `icons` non-array, array containing non-string, array containing empty/whitespace string.
    7. Rejects unknown biome (find returns null).
    8. Surfaces runtime.apply throws.
  - `defaultBiomeIconsRuntime (integration)` block using `as unknown as { ... }` casts:
    - beforeEach installs `globalThis.biomesData` with 4 slots (one `removed`), prefilled `icons` arrays, and `globalThis.drawReliefIcons = vi.fn()`.
    - Updates icons at the correct slot by id.
    - Updates icons by case-insensitive name.
    - Stored array is a copy (mutating input after the call doesn't affect stored).
    - `previousIcons` reflects pre-write contents (copied, not aliased).
    - Calls `drawReliefIcons` once, best-effort.
    - Swallows `drawReliefIcons` throw — data still mutates.
    - Refuses to update a `removed` biome (slot unchanged).
    - Errors when `biomesData` is missing entirely.

- [ ] T3 Register in `src/ai/index.ts`:
  - Add `import { setBiomeIconsTool } from "./tools/set-biome-icons";` immediately after the `set-biome-icons-density` import.
  - Add `createSetBiomeIconsTool` / `setBiomeIconsTool` re-export block immediately after the `set-biome-icons-density` export block.
  - Add `registry.register(setBiomeIconsTool);` immediately after `registry.register(setBiomeIconsDensityTool);`.

- [ ] T4 Add a `README_AI.md` row immediately after the existing `set_biome_icons_density` row, citing:
  - Writes `biomesData.icons[k]` and best-effort calls `drawReliefIcons()`.
  - Flat `string[]` runtime form; duplicates control relative frequency.
  - Empty array allowed (no icons for this biome).
  - Matches by id or case-insensitive name; removed biomes skipped.
  - Shared "Requires an Anthropic API key (see 'Getting an API key' below)" callout.

- [ ] T5 Verify:
  - Lint baseline before: `npm run lint 2>&1 | tail -5` — 7 warnings / 1 info / 0 errors.
  - After: `npm run build` succeeds, `npm test` all pass, `npm run lint` matches baseline.

- [ ] T6 Commit with `feat(ai): add set_biome_icons tool` staging only the six touched files (set-biome-icons.ts, set-biome-icons.test.ts, src/ai/index.ts, README_AI.md, aiplans/plan_155.md, aiplans/tasks_155.md).
