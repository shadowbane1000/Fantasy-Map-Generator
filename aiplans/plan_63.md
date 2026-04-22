# Plan 63 — set_biome_habitability AI tool

## Use case

The Biomes Editor has a habitability input per biome
(`biomeChangeHabitability` at
`public/modules/ui/biomes-editor.js:204`). It writes
`biomesData.habitability[i] = value` (validated as 0–9999) and
calls the global `recalculatePopulation()` to refresh cell
populations across the map, since habitability is a multiplier on
each biome's carrying capacity.

The chat has `list_biomes` (reads habitability) and the new
`rename_biome` / `set_biome_color` tools, but can't tune the
habitability knob. Prompts like "make hot deserts uninhabitable
(habitability 0)" or "bump grassland habitability to 40" have no
AI path.

## Scope

Add one tool: `set_biome_habitability(biome, habitability)`.

- `biome` required — numeric id (0 = Marine) or case-insensitive
  current name (via `findBiomeByRef`).
- `habitability` required integer in [0, 9999] (same range as the
  editor's validation).
- Write `biomesData.habitability[k] = value`.
- Best-effort call `recalculatePopulation()` if the global exists.
- Skip removed biomes (sentinel `"removed"`).

## Implementation

1. **New file `src/ai/tools/set-biome-habitability.ts`**:
   - Imports: `errorResult`, `getGlobal`, `okResult`;
     `findBiomeByRef` from `./rename-biome`.
   - `BiomeHabitabilityRef { i, name, previousHabitability }`.
   - `BiomeHabitabilityRuntime { find(ref), apply(id, value) }`.
   - `defaultBiomeHabitabilityRuntime.find`: `findBiomeByRef`;
     return `{ i, name, previousHabitability:
     biomesData.habitability?.[k] ?? 0 }`.
   - `defaultBiomeHabitabilityRuntime.apply(id, value)`:
     - Re-resolve via `findBiomeByRef`; throw if null.
     - Write `biomesData.habitability[k] = value`.
     - Best-effort `getGlobal<() => void>("recalculatePopulation")?.()`.
   - Tool schema: `biome` (int|string required), `habitability`
     (integer [0, 9999] required).

2. **Register** in `src/ai/index.ts`.

3. **Tests `src/ai/tools/set-biome-habitability.test.ts`**:
   - Runtime-injected:
     - Sets by numeric id.
     - Sets by case-insensitive name.
     - Reject invalid biome refs.
     - Reject non-integer / out-of-range habitability (< 0,
       > 9999, 1.5, NaN, non-number).
     - Accept boundary values 0 and 9999.
     - Error when biome unknown.
     - Surface runtime errors.
   - Default-runtime integration:
     - Stub `globalThis.biomesData` with 4 biomes incl "removed".
     - Stub `globalThis.recalculatePopulation` spy.
     - Apply habitability to biome 1 → `biomesData.habitability[1]`
       updated; `recalculatePopulation` called.
     - Apply to removed biome → error, no mutation, no recalc.
     - Soft: when `recalculatePopulation` is undefined, tool still
       succeeds.

4. **README_AI.md** — row near `set_biome_color`.

## Verification

- `npm test -- --run src/ai/tools/set-biome-habitability` green.
- `npm test -- --run` — 780 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can say "make tundras uninhabitable (0)" or "bump grassland
  habitability to 40" and the biome data + cell population reflect
  it.
- Out-of-range / non-integer rejected matching the editor's 0–9999
  bounds.
- Removed biome sentinel respected.
