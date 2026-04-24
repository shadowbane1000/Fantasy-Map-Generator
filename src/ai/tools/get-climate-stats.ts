import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ClimateStat {
  min: number;
  max: number;
  mean: number;
}

export interface ClimateStats {
  grid_cells: number;
  temperature: ClimateStat;
  precipitation: ClimateStat;
}

export interface ClimateStatsGridLike {
  cells?: {
    temp?: ArrayLike<number>;
    prec?: ArrayLike<number>;
  };
}

const ZERO_STAT: ClimateStat = { min: 0, max: 0, mean: 0 };

function summarize(arr: ArrayLike<number>): ClimateStat {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    const v = arr[i];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  }
  if (count === 0) return { ...ZERO_STAT };
  return { min, max, mean: sum / count };
}

/**
 * Pure aggregator: given the world grid, return per-map climate
 * statistics (min / max / mean) for temperature and precipitation.
 *
 * Temperature and precipitation live on the pre-Voronoi grid cells
 * (`grid.cells.temp`, `grid.cells.prec`) — the same arrays the per-cell
 * `get_cell_info` lookup reaches through `pack.cells.g[i]`, and the
 * same arrays the range finders (`find_cells_by_temperature_range`,
 * `find_cells_by_precipitation_range`) scan.
 *
 * `grid_cells` reports the length of the iterated array. `mean` is a
 * floating-point number (no rounding) so precision is preserved at
 * small sample sizes. Non-finite / non-numeric entries are skipped
 * per-array so a stray NaN in `temp` doesn't poison `prec`. When an
 * array yields zero valid entries, its stat defaults to
 * `{ min: 0, max: 0, mean: 0 }` so the output shape stays consistent.
 *
 * Returns `"not-ready"` when `grid` / `grid.cells` / `grid.cells.temp`
 * / `grid.cells.prec` is missing or lacks a numeric `length`.
 */
export function readClimateStatsFromGrid(
  grid: ClimateStatsGridLike | undefined,
): ClimateStats | "not-ready" {
  if (!grid || !grid.cells) return "not-ready";
  const temp = grid.cells.temp;
  const prec = grid.cells.prec;
  if (!temp || typeof temp.length !== "number") return "not-ready";
  if (!prec || typeof prec.length !== "number") return "not-ready";

  const temperature = summarize(temp);
  const precipitation = summarize(prec);

  // Either length is fine; in practice both arrays are the same
  // length (one entry per grid cell). Prefer `temp.length` for
  // reporting.
  return {
    grid_cells: temp.length,
    temperature,
    precipitation,
  };
}

export interface ClimateStatsRuntime {
  readStats(): ClimateStats | "not-ready";
}

export const defaultClimateStatsRuntime: ClimateStatsRuntime = {
  readStats(): ClimateStats | "not-ready" {
    return readClimateStatsFromGrid(getGlobal<ClimateStatsGridLike>("grid"));
  },
};

export function createGetClimateStatsTool(
  runtime: ClimateStatsRuntime = defaultClimateStatsRuntime,
): Tool {
  return {
    name: "get_climate_stats",
    description:
      "Read aggregate climate statistics for the whole generated world — the climate summary parallel of `get_population_stats` and the read-side summary companion to `find_cells_by_temperature_range` / `find_cells_by_precipitation_range`. Scans `grid.cells.temp` (signed int8 °C) and `grid.cells.prec` (uint8, higher = wetter) — the authoritative per-grid-cell arrays, reached for a single cell by `grid.cells.temp[pack.cells.g[packCellI]]` in `get_cell_info`. Computes `min`, `max`, and `mean` for each of temperature and precipitation in a single linear pass; `mean` is kept as a floating-point number (no rounding) so precision is preserved at small sample sizes. Non-finite / non-numeric entries are skipped per-array, so a stray NaN in one array doesn't poison the other. When an array yields zero valid entries, its stat defaults to `{ min: 0, max: 0, mean: 0 }` so the output shape stays consistent. `grid_cells` reports the length of the iterated array (both arrays are always the same length in the real app — one entry per grid cell). Takes no parameters. Returns `{ ok, grid_cells, temperature: {min, max, mean}, precipitation: {min, max, mean} }`. Useful for climate audits (\"what's the temperature range on this map?\", \"how wet is the world on average?\"), quick sanity checks after `set_climate` / `set_precipitation` / `set_wind` tweaks, picking sensible `min` / `max` bounds for the range-finder tools, or feeding a climate summary into higher-level narrative generation. Read-only — never mutates the grid or pack. Errors only on un-generated map (`grid` / `grid.cells` / `grid.cells.temp` / `grid.cells.prec` missing). Requires an Anthropic API key (see 'Getting an API key' below).",
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

export const getClimateStatsTool = createGetClimateStatsTool();
