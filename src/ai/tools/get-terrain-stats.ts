import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export type TerrainBandName =
  | "deep_water"
  | "shallow_water"
  | "coast"
  | "lowlands"
  | "hills"
  | "mountains"
  | "peaks";

/**
 * Inclusive `[min, max]` height ranges for each named band. Ordered so
 * any integer height in `[0, 100]` lands in exactly one band.
 */
export const TERRAIN_BAND_RANGES: ReadonlyArray<{
  name: TerrainBandName;
  min: number;
  max: number;
}> = [
  { name: "deep_water", min: 0, max: 4 },
  { name: "shallow_water", min: 5, max: 19 },
  { name: "coast", min: 20, max: 25 },
  { name: "lowlands", min: 26, max: 39 },
  { name: "hills", min: 40, max: 59 },
  { name: "mountains", min: 60, max: 79 },
  { name: "peaks", min: 80, max: 100 },
];

interface PackLike {
  cells?: {
    h?: ArrayLike<number>;
    t?: ArrayLike<number>;
  };
}

export interface TerrainBandEntry {
  count: number;
  percentage: number;
}

export type TerrainBands = Record<TerrainBandName, TerrainBandEntry>;

export interface TerrainStats {
  total_cells: number;
  land_cells: number;
  water_cells: number;
  land_pct: number;
  water_pct: number;
  coastal_cells: number;
  peaks: number;
  height_min: number;
  height_max: number;
  height_mean: number;
  bands: TerrainBands;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pctOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return round2((count / total) * 100);
}

function emptyBands(): TerrainBands {
  const out = {} as TerrainBands;
  for (const band of TERRAIN_BAND_RANGES) {
    out[band.name] = { count: 0, percentage: 0 };
  }
  return out;
}

function bandForHeight(h: number): TerrainBandName | null {
  for (const band of TERRAIN_BAND_RANGES) {
    if (h >= band.min && h <= band.max) return band.name;
  }
  return null;
}

/**
 * Pure aggregator: given the world state (`pack`), return terrain /
 * geography statistics (land vs water counts, coast count, peak count,
 * height histogram, min / max / mean height). Iterates `pack.cells.h`
 * once for counts and stats, and `pack.cells.t` once for the coast
 * count (when present). Returns `"not-ready"` only when pack / cells /
 * `cells.h` are missing or don't expose a numeric `length`.
 *
 * Band layout (inclusive):
 *   deep_water    0-4
 *   shallow_water 5-19
 *   coast         20-25
 *   lowlands      26-39
 *   hills         40-59
 *   mountains     60-79
 *   peaks         80-100
 *
 * Land is `h >= 20`, water is `h < 20`, peaks is `h >= 80`.
 * Coast cells are those where `t === 1 || t === -1`; when `cells.t`
 * is absent we still succeed and report `coastal_cells: 0`.
 */
export function readTerrainStatsFromPack(
  pack: PackLike | undefined,
): TerrainStats | "not-ready" {
  if (!pack || !pack.cells) return "not-ready";
  const h = pack.cells.h;
  if (!h || typeof h.length !== "number") return "not-ready";

  const total = h.length;
  const bands = emptyBands();

  let land = 0;
  let water = 0;
  let peaks = 0;
  let sum = 0;
  let min = total > 0 ? Number.POSITIVE_INFINITY : 0;
  let max = total > 0 ? Number.NEGATIVE_INFINITY : 0;

  for (let i = 0; i < total; i++) {
    const v = h[i];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v >= 20) land++;
    else water++;
    if (v >= 80) peaks++;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    const band = bandForHeight(v);
    if (band !== null) bands[band].count++;
  }

  if (total === 0) {
    min = 0;
    max = 0;
  } else if (!Number.isFinite(min) || !Number.isFinite(max)) {
    // every cell was non-finite; surface neutral values rather than ±Infinity.
    min = 0;
    max = 0;
  }

  // Fill band percentages.
  for (const band of TERRAIN_BAND_RANGES) {
    bands[band.name].percentage = pctOf(bands[band.name].count, total);
  }

  // Coast count via cells.t — optional.
  let coastal = 0;
  const t = pack.cells.t;
  if (t && typeof t.length === "number") {
    const tLen = t.length;
    for (let i = 0; i < tLen; i++) {
      const v = t[i];
      if (v === 1 || v === -1) coastal++;
    }
  }

  const mean = total > 0 ? round2(sum / total) : 0;

  return {
    total_cells: total,
    land_cells: land,
    water_cells: water,
    land_pct: pctOf(land, total),
    water_pct: pctOf(water, total),
    coastal_cells: coastal,
    peaks,
    height_min: min,
    height_max: max,
    height_mean: mean,
    bands,
  };
}

export interface TerrainStatsRuntime {
  readStats(): TerrainStats | "not-ready";
}

export const defaultTerrainStatsRuntime: TerrainStatsRuntime = {
  readStats(): TerrainStats | "not-ready" {
    return readTerrainStatsFromPack(getPack<PackLike>());
  },
};

export function createGetTerrainStatsTool(
  runtime: TerrainStatsRuntime = defaultTerrainStatsRuntime,
): Tool {
  return {
    name: "get_terrain_stats",
    description:
      "Read aggregate terrain and geography statistics for the whole generated world — the elevation / geography parallel of `get_population_stats`, `get_biome_distribution`, and `get_culture_distribution`. Walks `pack.cells.h` once to tally land vs water counts, peak count, a height histogram bucketed into seven named bands, and min / max / mean height; walks `pack.cells.t` once (when present) to count coastal cells (cells where `t === 1 || t === -1`, i.e. LAND_COAST or WATER_COAST as set by `Features.markupPack`). Heights are integers in `[0, 100]`: `0-19` is water (deep ocean to shallow sea), `20` is sea level (`ELEVATION_NEUTRAL_HEIGHT`) and up, `80+` is peaks. Band layout (inclusive): `deep_water` (0-4), `shallow_water` (5-19), `coast` (20-25), `lowlands` (26-39), `hills` (40-59), `mountains` (60-79), `peaks` (80-100). Accepts no parameters. Returns `{ ok, total_cells, land_cells, water_cells, land_pct, water_pct, coastal_cells, peaks, height_min, height_max, height_mean, bands }` where each `bands[name]` entry is `{ count, percentage }` and percentages are rounded to 2 decimals. Useful for terrain audits (\"what's the world made of?\"), heightmap sanity checks after `modify_heightmap` / `smooth_heightmap` / `invert_heightmap`, picking mountain / peak targets for `add_marker`, deciding whether to flatten lowlands, and summarising world geography without forcing the caller to pick height bounds up-front. When `pack.cells.t` is missing (a map that hasn't been through `markupPack`), the tool still succeeds but reports `coastal_cells: 0`. Read-only; never mutates the pack. Errors only on un-generated map (pack, `pack.cells`, or `pack.cells.h` missing). Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const stats = runtime.readStats();
      if (stats === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...stats });
    },
  };
}

export const getTerrainStatsTool = createGetTerrainStatsTool();
