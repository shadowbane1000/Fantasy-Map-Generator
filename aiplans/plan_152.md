# Plan 152 — `set_biome_icons_density` AI tool

## Use case

Set a biome's relief-icon density — `biomesData.iconsDensity[k]`. This
controls roughly how many mountain / tree / dune / etc. relief icons get
drawn per cell of the biome (higher = more icons). 0 disables biome-level
(lowland) relief icons for that biome entirely; relief icons for high
ground (height ≥ 50) are still drawn regardless because the renderer only
gates `placeBiomeIcons()` behind this field, not `placeReliefIcons()`.

Default densities (see `src/modules/biomes.ts:46`):

```ts
const iconsDensity: number[] = [
  0,   // Marine
  3,   // Hot desert
  2,   // Cold desert
  120, // Savanna
  120, // Grassland
  120, // Tropical seasonal forest
  120, // Temperate deciduous forest
  150, // Tropical rainforest
  150, // Temperate rainforest
  100, // Taiga
  5,   // Tundra
  0,   // Glacier
  250, // Wetland
];
```

Values are small-to-middling integers; the highest default is **250**
(Wetland).

## Data path & UI confirmation

`biomesData.iconsDensity[k]` is the canonical path. Write sites:

- `public/modules/ui/biomes-editor.js:289` — on `addCustomBiome`, pushes
  `0` as the default density for a new biome.
- `public/modules/io/load.js:297` — when loading an older map missing
  `iconsDensity`, backfills `0` for every biome.

Read site (renderer):

- `src/renderers/draw-relief-icons.ts:32,42,44` — `placeBiomeIcons()`
  divides `biomesData.iconsDensity[biome] / 100` to derive a Poisson disc
  sampling radius and an early-exit probability.

The **Biomes Editor does NOT expose** an `iconsDensity` input — it's a
data-only field (like `cost`). However, there is a `regenerateIcons()`
helper at `biomes-editor.js:325` that calls `drawReliefIcons()` + toggles
the relief layer on. Since the field feeds the relief-icons renderer
directly, a best-effort `drawReliefIcons()` call after mutation is the
right side-effect to mirror what the editor does when its "Regenerate
Icons" button is clicked.

## Bounds

No hard cap exists in the codebase. Default range: `[0, 250]` (0 means
"no lowland icons for this biome"). To keep the tool permissive while
matching the defaults' integer shape, use:

- min `0` (disabled — no biome icons drawn)
- max `1000` (4× the highest default; generous headroom for custom maps)
- integer only (all defaults are whole numbers; the renderer divides by
  100 so sub-1 precision would only buy fractions of a radius unit)

## Shape mirrors `set_biome_cost` / `set_biome_habitability`

```ts
export interface BiomeIconsDensityRef {
  i: number;
  name: string;
  previousDensity: number;
}

export interface BiomeIconsDensityRuntime {
  find(ref: number | string): BiomeIconsDensityRef | null;
  apply(id: number, value: number): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  iconsDensity?: number[];
}
```

Default runtime:
- `find(ref)` — reuses `findBiomeByRef` from `rename-biome.ts`; reads
  `biomesData.iconsDensity[k]` (defaulting to `0`).
- `apply(id, value)` — `findBiomeByRef` again, then
  `biomesData.iconsDensity[res.k] = value`; then best-effort calls
  `drawReliefIcons()` inside a try/catch (same pattern
  `set_biome_habitability` uses for `recalculatePopulation`).

## Tool contract

Inputs:

```
{
  biome: number | string  // biome id (0 = Marine) or case-insensitive name
  density: number         // integer in [0, 1000]
}
```

Success output:

```
{ ok: true, i, name, previousDensity, density }
```

## Validation

- `biome`: non-negative integer id, or non-empty string name
  (reject `null`, `undefined`, `-1`, `1.5`, `""`).
- `density`: integer in `[0, 1000]` (reject non-integer, out-of-range,
  `NaN`, `Infinity`, string numbers like `"10"`, `null`).
- `find` returning null → `errorResult("No biome found matching …")`.
- `apply` throws → surface the error.

## Integration test (globalThis seam)

Mirror `set-biome-cost.test.ts`'s integration block:

- `globalThis.biomesData` with `i`, `name` (with a `"removed"` slot),
  `iconsDensity`.
- Stub `globalThis.drawReliefIcons` with a vi.fn() so we can assert the
  redraw best-effort was invoked; also test that a throwing stub doesn't
  fail the mutation (swallowed try/catch).
- Cases:
  - updates the density at the correct `k` (numeric id).
  - refuses to update a `"removed"` slot.
  - finds by case-insensitive name.
  - calls drawReliefIcons best-effort; swallows errors.

Plus seam tests (mock runtime directly):
- numeric id → apply called with `(id, value)`.
- case-insensitive name → apply called with the resolved id.
- boundary values `0` and `1000` accepted.
- invalid biome refs rejected (`null`, `undefined`, `-1`, `1.5`, `""`).
- invalid density values rejected (`-1`, `1001`, `1.5`, `NaN`, `Infinity`,
  `"10"`, `null`).
- unknown biome → errorResult.
- runtime `apply` throw surfaced.

## Files touched

- `src/ai/tools/set-biome-icons-density.ts` (new)
- `src/ai/tools/set-biome-icons-density.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row near `set_biome_cost` / `set_biome_habitability`
