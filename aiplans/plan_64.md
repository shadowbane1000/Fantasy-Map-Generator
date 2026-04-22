# Plan 64 — remove_biome AI tool

## Use case

The Biomes Editor's trash icon (`removeCustomBiome` at
`public/modules/ui/biomes-editor.js:318`) removes a **custom**
biome — it sets `biomesData.name[i] = "removed"` (the sentinel
already honoured by `rename_biome` / `set_biome_color` /
`set_biome_habitability`). The UI only exposes the trash icon on
custom biomes (id >= 13, i.e. beyond the 13 built-ins), not on
defaults — removing a default could leave cells pointing at a
vanished category.

The chat now has list + rename + recolor + habitability for
biomes. Remove is the last direct verb, and the natural counterpart
to a hypothetical `add_biome` tool.

## Scope

Add one tool: `remove_biome(biome)`.

- `biome` required — numeric id >= 13 OR case-insensitive current
  name (the matched biome must have id >= 13).
- Sets `biomesData.name[k] = "removed"` (same sentinel the UI uses).
- Rejects removal of defaults (id < 13). Explicit error with the
  underlying reason so the AI doesn't guess.
- Rejects if the slot is already `"removed"`.

## Implementation

1. **New file `src/ai/tools/remove-biome.ts`**:
   - Imports: `errorResult`, `getGlobal`, `okResult`;
     `findBiomeByRef` from `./rename-biome`.
   - `DEFAULT_BIOME_COUNT = 13`.
   - `RemoveBiomeRef { i, name }`.
   - `BiomeRemovalRuntime { find(ref), remove(id) }`.
   - `defaultBiomeRemovalRuntime.find`: `findBiomeByRef`.
   - `defaultBiomeRemovalRuntime.remove(id)`:
     - Re-resolve via `findBiomeByRef`; throw if null.
     - Throw if `id < DEFAULT_BIOME_COUNT` (defence in depth; the
       tool also guards before calling).
     - Set `biomesData.name[k] = "removed"`.
   - Tool schema: `biome` (int|string required).
   - Execute: validate ref; `find` → 404; if `current.i <
     DEFAULT_BIOME_COUNT` reject with explanation; try
     `remove(current.i)`; return `{ i, name }`.

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/remove-biome.test.ts`**:
   - Runtime-injected:
     - Remove by id (id 13).
     - Remove by case-insensitive name.
     - Reject invalid biome refs.
     - Error when biome unknown.
     - Reject removal of a default biome (id 0..12).
     - Surface runtime failures.
   - Default-runtime integration:
     - Stub `globalThis.biomesData` with 15 biomes (13 defaults +
       2 customs), including one already "removed".
     - Remove custom biome 13 → name[13] becomes "removed".
     - Remove custom biome by name → correct slot updated.
     - Removal of default biome id 5 → error, no mutation.
     - Removal of an already-removed biome → error (findBiomeByRef
       skips removed → 404).

4. **README_AI.md** — row under `set_biome_habitability`.

## Verification

- `npm test -- --run src/ai/tools/remove-biome` green.
- `npm test -- --run` — 790 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can remove custom biomes matching the Biomes Editor trash
  behaviour.
- Default biomes (id 0..12) are protected — removing them would
  corrupt cell assignments.
- Already-removed biomes can't be re-removed (they don't resolve).
