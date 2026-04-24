# Plan 262 — `get_terrain_stats` AI tool

## Goal

Add a new read-only AI tool `get_terrain_stats` that aggregates terrain /
geography statistics for the whole generated world: total cells, land vs
water counts (and their percentages), coastal cell count, peak cell count,
height histogram bucketed into named bands, and min / max / mean height.

This is a read-only aggregate analogous to `get_population_stats` and
`get_biome_distribution` — it scans `pack.cells.h` once (and `pack.cells.t`
once for coast count) and returns a single structured summary.

## Data model

Height semantics (confirmed from `find-cells-by-height-range.ts`):

- Heights are integers in `[0, 100]`.
- `0-19` is water.
- `20` is sea-level / coast threshold (`ELEVATION_NEUTRAL_HEIGHT`).
- `20+` is land, `80+` is peaks.

Coast semantics (confirmed from `find-coast-cells.ts`):

- `pack.cells.t` stores a distance field set by `Features.markupPack`.
- `+1` = `LAND_COAST` (land cell with ≥1 water neighbor).
- `-1` = `WATER_COAST` (water cell with ≥1 land neighbor).
- Higher absolute values are further inland / deeper water.
- "Coastal cells" per this tool means `t === 1 || t === -1` (both sides).

## Bands

The band layout is fixed by the use-case spec:

| band            | inclusive range |
|-----------------|-----------------|
| `deep_water`    | `0-4`           |
| `shallow_water` | `5-19`          |
| `coast`         | `20-25`         |
| `lowlands`      | `26-39`         |
| `hills`         | `40-59`         |
| `mountains`     | `60-79`         |
| `peaks`         | `80-100`        |

Each band entry in the response is `{ count, percentage }`. Percentages
are calculated as `count / total_cells * 100`, rounded to 2 decimals
(matching `get_biome_distribution` convention). When `total_cells === 0`,
every percentage is `0`.

## Counts & stats

- `total_cells` — `pack.cells.h.length`.
- `land_cells` — `h >= 20`.
- `water_cells` — `h < 20`.
- `coastal_cells` — `t === 1 || t === -1`. When `pack.cells.t` is
  missing (e.g. on a map that never ran `markupPack`), this field is
  still emitted and set to `0` — we do not error.
- `peaks` — `h >= 80`.
- `land_pct`, `water_pct` — percentages, rounded to 2 decimals.
- `height_min` — min over `cells.h`. `0` when cells array is empty.
- `height_max` — max over `cells.h`. `0` when cells array is empty.
- `height_mean` — arithmetic mean rounded to 2 decimals. `0` when empty.

## Return shape

```ts
{
  ok: true,
  total_cells: number,
  land_cells: number,
  water_cells: number,
  land_pct: number,
  water_pct: number,
  coastal_cells: number,
  peaks: number,
  height_min: number,
  height_max: number,
  height_mean: number,
  bands: {
    deep_water: { count: number, percentage: number },
    shallow_water: { count: number, percentage: number },
    coast: { count: number, percentage: number },
    lowlands: { count: number, percentage: number },
    hills: { count: number, percentage: number },
    mountains: { count: number, percentage: number },
    peaks: { count: number, percentage: number },
  },
}
```

## Errors

Only one: un-generated map (`pack`, `pack.cells`, or `pack.cells.h`
missing / not array-like). In that case we return a structured error
pointing at the `map:generated` window event, matching the other stats
tools.

## File layout

- `src/ai/tools/get-terrain-stats.ts` — tool definition.
  - `PackLike` with `cells: { h?: ArrayLike<number>, t?: ArrayLike<number> }`.
  - Pure function `readTerrainStatsFromPack(pack): TerrainStats | "not-ready"`.
  - `TerrainStatsRuntime` seam with `defaultTerrainStatsRuntime`.
  - `createGetTerrainStatsTool(runtime)` — mirrors the population stats
    / biome distribution pattern.
  - `export const getTerrainStatsTool = createGetTerrainStatsTool();`
- `src/ai/tools/get-terrain-stats.test.ts` — pure / seam / surface /
  default-runtime integration blocks using `as unknown as { ... }` casts.
- `src/ai/index.ts` — add the import + export block + `registry.register`
  call next to `getPopulationStatsTool`.
- `README_AI.md` — new row next to `get_population_stats` with API-key
  note and usage examples.

## Tests

Pure / seam:
- Empty pack → `not-ready`.
- Missing `cells.h` → `not-ready`.
- Correct land / water / peaks counts for a known fixture.
- Correct coast count when `cells.t` provided.
- Missing `cells.t` → `coastal_cells === 0` (NOT `not-ready`).
- Band boundaries: a cell at `h = 4` goes to `deep_water`, `h = 5` goes to
  `shallow_water`, `h = 19` → `shallow_water`, `h = 20` → `coast`, `h = 25`
  → `coast`, `h = 26` → `lowlands`, `h = 39` → `lowlands`, `h = 40` →
  `hills`, `h = 59` → `hills`, `h = 60` → `mountains`, `h = 79` →
  `mountains`, `h = 80` → `peaks`, `h = 100` → `peaks`.
- Percentages sum to ~100.
- `height_min` / `max` / `mean` correct for a mixed fixture.

Surface:
- `execute({})` returns ok shape and expected fields.
- `not-ready` surfaces as structured error.
- Ignores unrelated input keys (no required fields).
- Tool registered under `get_terrain_stats`.

Integration (defaultTerrainStatsRuntime with globalThis.pack):
- Setting `globalThis.pack` to a fake produces correct aggregate stats.
- Un-setting it produces structured `not-ready` error via the tool.

## Verification checklist

- `npm run build` succeeds.
- `npm test` all pass.
- `npm run lint` matches baseline (7 warnings / 1 info / 0 errors).
- README_AI row added next to `get_population_stats`.
