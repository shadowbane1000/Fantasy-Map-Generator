# Plan 149 — `set_biome_cost` AI tool

## Use case

Set the per-biome traversal cost used by states / cultures / religions expansion.
`biomesData.cost[k]` is the "movement cost" penalty applied when these
entities try to expand into a non-native biome; higher cost => harder to
expand through that biome. E.g. Glacier = 5000 (nearly impassable), Grassland = 50 (easy).

Default biome costs (see `src/modules/biomes.ts:64`):

```ts
const cost: number[] = [
  10,   // Marine
  200,  // Hot desert
  150,  // Cold desert
  60,   // Savanna
  50,   // Grassland
  70,   // Tropical seasonal forest
  70,   // Temperate deciduous forest
  80,   // Tropical rainforest
  90,   // Temperate rainforest
  200,  // Taiga
  1000, // Tundra
  5000, // Glacier
  150,  // Wetland
]; // biome movement cost
```

## Data path & UI confirmation

`biomesData.cost[k]` is the canonical path. Two write sites in the codebase:

- `public/modules/ui/biomes-editor.js:291` — on `addCustomBiome`, pushes `50` as the default cost for a new biome.
- `public/modules/io/load.js:299` — when loading an older map missing `cost`, backfills `50` for every biome.

Read sites (expansion cost-funcs):

- `src/modules/states-generator.ts:94,96,97` — `getBiomeCost` multiplier.
- `src/modules/cultures-generator.ts:1320,1322,1323` — `getBiomeCost` multiplier.
- `src/modules/religions-generator.ts:948` — `biomePassageCost`.

**UI surface**: none. The Biomes Editor (`public/modules/ui/biomes-editor.js`)
exposes inputs only for **name**, **color** (via fill-box), and
**habitability**. `cost` is a data-only field — there is no per-row input to
refresh. This contrasts with `set_biome_color` (which refreshes the
`#biome{i}` SVG element fill/stroke) and `set_biome_habitability` (which
also calls `recalculatePopulation()`). For `cost`:

- No DOM update.
- No recalculation — cost is only consulted by the *next* run of
  `states-generator` / `cultures-generator` / `religions-generator`. Mutating
  it has no retroactive effect on an existing map's expansion. Document this
  in the tool description.

## Bounds

The field is a plain JS number in the default array. No hard cap is enforced
anywhere in the codebase. The highest default is **5000** (Glacier). To keep
the tool permissive for custom setups (e.g. making a "completely impassable"
biome) while still catching accidental garbage, use:

- min `0` (no penalty — anyone can enter freely)
- max `100000` (20× the highest default; plenty of headroom)
- integer only (matches the defaults, which are all round integers; no
  fractional costs exist in the codebase)

## Shape mirrors `set_biome_habitability`

Per the user's use case, the tool mirrors the habitability-setter one-for-one
minus the recalc side-effect:

```ts
export interface BiomeCostRef {
  i: number;
  name: string;
  previousCost: number;
}

export interface BiomeCostRuntime {
  find(ref: number | string): BiomeCostRef | null;
  apply(id: number, value: number): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  cost?: number[];
}
```

Default runtime:
- `find(ref)` — reuses `findBiomeByRef` from `rename-biome.ts`; reads
  `biomesData.cost[k]` (defaulting to `0`).
- `apply(id, value)` — `findBiomeByRef` again, then
  `biomesData.cost[res.k] = value`.

## Tool contract

Inputs:

```
{
  biome: number | string  // biome id (0 = Marine) or case-insensitive name
  cost: number            // integer in [0, 100000]
}
```

Success output:

```
{ ok: true, i, name, previousCost, cost }
```

## Validation

- `biome`: non-negative integer id, or non-empty string name
  (reject `null`, `undefined`, `-1`, `1.5`, `""`).
- `cost`: integer in `[0, 100000]` (reject non-integer, out-of-range,
  `NaN`, `Infinity`, string numbers like `"10"`, `null`).
- `find` returning null → `errorResult("No biome found matching …")`
  (same message shape as the sibling biome tools).
- `apply` throws → surface the error.

## Integration test (globalThis seam)

Mirror `set-biome-habitability.test.ts`'s integration block:

- `globalThis.biomesData` with `i`, `name` (with a `"removed"` slot to
  prove tombstones are skipped), and `cost`.
- No `recalculatePopulation` stub — `cost` has no recalc side-effect.
- Cases:
  - updates the cost at the correct `k` (numeric id).
  - refuses to update a `"removed"` slot.
  - finds by case-insensitive name.
  - (no DOM / recalc assertions needed — none exist for cost).

Plus seam tests (mock runtime directly):
- numeric id → apply called with `(id, value)`.
- case-insensitive name → apply called with the resolved id.
- boundary values `0` and `100000` accepted.
- invalid biome refs rejected (`null`, `undefined`, `-1`, `1.5`, `""`).
- invalid cost values rejected (`-1`, `100001`, `1.5`, `NaN`, `Infinity`, `"10"`, `null`).
- unknown biome → errorResult.
- runtime `apply` throw surfaced.

## Files touched

- `src/ai/tools/set-biome-cost.ts` (new)
- `src/ai/tools/set-biome-cost.test.ts` (new)
- `src/ai/index.ts` — import, re-export, register
- `README_AI.md` — new row next to `set_biome_habitability` / `set_biome_color`
