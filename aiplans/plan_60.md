# Plan 60 — list_biomes AI tool

## Use case

The Biomes Editor (`public/modules/ui/biomes-editor.js`) displays
the 13 default biomes — Marine, Hot Desert, Cold Desert, Savanna,
Grassland, Tropical Seasonal Forest, Temperate Deciduous Forest,
Tropical Rainforest, Temperate Rainforest, Taiga, Tundra, Glacier,
Wetland — plus any user-added biomes. Data lives in `window.biomesData`
(parallel arrays: `i[]`, `name[]`, `color[]`, `habitability[]`,
`iconsDensity[]`, `cost[]`, optionally populated `cells[]`, `area[]`,
`rural[]`, `urban[]` when the editor has been opened).

The AI chat currently has no way to enumerate biomes. Prompts like
"which biomes cover this map?", "which biome has the highest
habitability?", or "list the biomes with their colors" can't land.

## Scope

Add one tool: `list_biomes`. Paginated (consistency with other
list tools). Each summary reports:

- `i`, `name`, `color`.
- `habitability`, `iconsDensity`, `cost`.
- `cells`, `area`, `rural`, `urban`, `population` (= rural + urban,
  scaled by `populationRate`) — default 0 when not yet computed.

No filter parameters in the first cut — the list is small and
uniform. Pagination via limit/offset if the user asks.

## Implementation

1. **New file `src/ai/tools/list-biomes.ts`**:
   - Imports: `createPaginatedListTool`, `getGlobal`.
   - `BiomeSummary { i, name, color, habitability, iconsDensity,
     cost, cells, area, rural, urban, population }`.
   - `BiomesData { i: number[]; name: string[]; color: string[];
     habitability: number[]; iconsDensity: number[]; cost: number[];
     cells?: number[]; area?: number[]; rural?: number[];
     urban?: number[] }`.
   - `readBiomesFromPack(biomesData, populationRate)`:
     - Return null when `biomesData?.i` isn't an array.
     - Map each index `k` to a BiomeSummary, defaulting missing
       fields to 0 / "".
   - `BiomesRuntime { readBiomes(): BiomeSummary[] | null }`.
   - `defaultBiomesRuntime.readBiomes`:
     `readBiomesFromPack(getGlobal<BiomesData>("biomesData"),
     getGlobal<number>("populationRate") ?? 1)`.
   - Tool factory via `createPaginatedListTool`:
     - `name: "list_biomes"`.
     - `collectionKey: "biomes"`.
     - `notReadyError`: "Biomes data is not available yet."

2. **Register** in `src/ai/index.ts` — import, barrel, register
   next to other list tools.

3. **Tests `src/ai/tools/list-biomes.test.ts`**:
   - Returns list with all fields.
   - Returns null-ready when biomesData missing.
   - Reads cells/area/rural/urban when present.
   - Missing cells/area/rural/urban default to 0.
   - population = (rural+urban) * populationRate, rounded.
   - Pagination.
   - `readBiomesFromPack` unit tests: null input, empty, full.
   - Default runtime integration: set `globalThis.biomesData`,
     populate a small data, call the tool, verify output.

4. **README_AI.md** — row near `list_rivers`.

## Verification

- `npm test -- --run src/ai/tools/list-biomes` green.
- `npm test -- --run` — 744 before.
- `npm run lint` — 7/1.
- `npm run build` succeeds.

## Success criteria

- Tool registered and callable.
- AI can ask "what biomes are on the map and how habitable are they?"
  and get the full biome catalog with per-biome stats.
- Handles the case where the Biomes Editor hasn't been opened
  (cells/area/rural/urban arrays missing) without crashing.
