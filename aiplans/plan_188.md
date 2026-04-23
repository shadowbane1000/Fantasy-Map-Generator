# Plan 188 — `get_biome_info` tool

## Goal

Add a read-only AI tool `get_biome_info` that returns detailed
information about a single biome: name, color, habitability,
iconsDensity, icons list, cost, cell count, total area, total
population, and burg count.

Parallels `get_state_info` / `get_culture_info` / `get_religion_info`
but sources fields from the global `biomesData` (the legacy biome
store) rather than `pack.biomes`. Per-biome cell/area/population stats
are derived live from `pack.cells` — unlike `list_biomes`, which
reflects the precomputed Biomes Editor aggregates.

## Scope

Read-only, additive. No side effects. No changes to existing tools.

## Data sources

- `globalThis.biomesData` — `{ i: number[], name: string[],
  color: string[], habitability: number[], iconsDensity: number[],
  cost: number[], icons: string[][] }`. Indexed by "k" (slot), not
  by biome id. Use the shared `findBiomeByRef` helper (from
  `rename-biome`) to resolve a ref to `{ k, id, name }`.
- `globalThis.pack.cells.biome` — per-cell biome id (TypedArray).
  Drives `cells_count`.
- `globalThis.pack.cells.area` — per-cell area. Drives `area`
  (summed).
- `globalThis.pack.cells.pop` — per-cell population. Drives
  `population_total` (summed, scaled by `populationRate`).
- `globalThis.pack.burgs` — iterate non-removed burgs whose cell's
  biome matches; drives `burgs_count`.
- `globalThis.populationRate` — scalar multiplier.

## Public API shape

```ts
interface BiomeInfo {
  i: number;
  name: string;
  color: string | null;
  habitability: number;
  iconsDensity: number;
  icons: string[];
  cost: number;
  cells_count: number;
  area: number;
  population_total: number;
  burgs_count: number;
}
```

Tool returns `{ ok: true, ...BiomeInfo }` on success or a structured
error via `errorResult(...)` on failure.

## Input

```json
{
  "biome": <integer | string>
}
```

- Integer: non-negative biome id (0 = Marine is valid).
- String: case-insensitive biome name (the current `biomesData.name[k]`
  value; the sentinel `"removed"` is filtered out).

## Errors

- Non-integer / non-string ref → structured error.
- `biomesData` missing → "not ready" structured error.
- Ref not found / biome marked `removed` → structured "No biome
  found" error.

## Implementation sketch

- `src/ai/tools/get-biome-info.ts`:
  - Reuse `findBiomeByRef` from `./rename-biome`.
  - Pure helper `readBiomeInfoFromPack(biomesData, pack,
    populationRate, ref)` returning `BiomeInfo | "not-ready" |
    "not-found"`.
  - Runtime seam `BiomeInfoRuntime.readBiome(ref)` + default
    implementation that reads the globals.
  - Factory `createGetBiomeInfoTool(runtime?)` returning a `Tool`.
  - Exported `getBiomeInfoTool` (default runtime).

- `src/ai/tools/get-biome-info.test.ts`:
  - Pure/seam tests: readBiomeInfoFromPack sums cells/area/pop
    correctly; burgs_count filters removed + placeholder; icons/color
    fall through correctly; not-ready / not-found paths.
  - Tool tests: schema, rejects bad refs, quotes refs on not-found,
    allows id 0 (Marine).
  - `defaultBiomeInfoRuntime` integration: seeds
    `globalThis.biomesData` + `globalThis.pack` + `populationRate`,
    restores after; asserts full field output.

- `src/ai/index.ts`:
  - `import { getBiomeInfoTool } from "./tools/get-biome-info";`
    near `getReligionInfoTool`.
  - Re-export its `create*` + helpers.
  - Register in `buildDefaultRegistry` near the other `get_*_info`
    tools.

- `README_AI.md`:
  - Add row for `get_biome_info` next to `get_state_info` /
    `get_river_info` describing fields + API key requirement.

## Verify

- `npm run build` succeeds.
- `npm test` passes: adds ~12 new tests on top of the current 2708.
- `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
