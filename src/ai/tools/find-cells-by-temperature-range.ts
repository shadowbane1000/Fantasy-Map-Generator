import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT = 10000;
export const MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT = 100000;
export const MIN_TEMPERATURE = -128;
export const MAX_TEMPERATURE = 127;

interface PackLike {
  cells?: {
    i?: ArrayLike<number>;
    g?: ArrayLike<number>;
  };
}

interface GridLike {
  cells?: {
    temp?: ArrayLike<number>;
  };
}

export interface FindCellsByTemperatureRangeHit {
  cells: number[];
  count: number;
}

export type FindCellsByTemperatureRangeResult =
  | FindCellsByTemperatureRangeHit
  | "not-ready";

/**
 * Pure collector: given the world state (`pack` + `grid`) and an
 * inclusive temperature range `[min, max]` in °C, return every pack
 * cell index `i` where `grid.cells.temp[pack.cells.g[i]]` satisfies
 * `t >= min && t <= max`. `count` reports the full unlimited total
 * even when `cells` is truncated by `limit`.
 *
 * Temperature lives on the pre-Voronoi grid cells; the lookup hop is
 * `pack.cells.g[packCellI] → grid.cells.temp[gridI]` (mirrors
 * `get_cell_info`).
 *
 * Returns `"not-ready"` when pack / pack.cells / pack.cells.g are
 * missing, or when grid / grid.cells / grid.cells.temp are missing.
 */
export function findCellsByTemperatureRangeInPack(
  pack: PackLike | undefined,
  grid: GridLike | undefined,
  min: number,
  max: number,
  limit: number,
): FindCellsByTemperatureRangeResult {
  if (!pack || !pack.cells) return "not-ready";
  const g = pack.cells.g;
  if (!g || typeof g.length !== "number") return "not-ready";
  const temp = grid?.cells?.temp;
  if (!temp || typeof temp.length !== "number") return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = g.length;
  for (let i = 0; i < length; i++) {
    const gridI = g[i];
    if (typeof gridI !== "number") continue;
    const v = temp[gridI];
    if (typeof v !== "number") continue;
    if (v >= min && v <= max) {
      count++;
      if (cells.length < cap) cells.push(i);
    }
  }

  return { cells, count };
}

export interface FindCellsByTemperatureRangeRuntime {
  find(
    min: number,
    max: number,
    limit: number,
  ): FindCellsByTemperatureRangeResult;
}

export const defaultFindCellsByTemperatureRangeRuntime: FindCellsByTemperatureRangeRuntime =
  {
    find(min, max, limit) {
      return findCellsByTemperatureRangeInPack(
        getPack<PackLike>(),
        getGlobal<GridLike>("grid"),
        min,
        max,
        limit,
      );
    },
  };

function parseTemperature(value: unknown, label: string): number | string {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_TEMPERATURE ||
    value > MAX_TEMPERATURE
  ) {
    return `${label} must be an integer in [${MIN_TEMPERATURE}, ${MAX_TEMPERATURE}].`;
  }
  return value;
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT}].`;
  }
  return value;
}

export function createFindCellsByTemperatureRangeTool(
  runtime: FindCellsByTemperatureRangeRuntime = defaultFindCellsByTemperatureRangeRuntime,
): Tool {
  return {
    name: "find_cells_by_temperature_range",
    description:
      "List every packed-grid cell index whose temperature (°C) falls inside the inclusive range `[min, max]` — the climate parallel of `find_cells_by_height_range` (filters by elevation) and `find_cells_by_biome` (filters by biome). Temperature lives per-grid-cell on `grid.cells.temp`, reached from a pack cell via the grid pointer: `grid.cells.temp[pack.cells.g[packCellI]]` (same hop `get_cell_info` uses). Values are signed `int8` °C in the app's typed array, so `min` and `max` are required integers in `[-128, 127]` and must satisfy `min <= max`; both bounds are inclusive, so `{min: 0, max: 0}` returns every cell exactly at 0 °C, and `{min: -128, max: 127}` returns every cell. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so sweeping ranges don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.g` linearly and collects every index where the resolved grid temperature is in range. Returns `{ ok, min, max, cells, count }`. Useful as a first step for bulk climate operations — drop ice onto cold cells, audit tundra / desert distribution, seed volcano markers in warm bands, pick candidate cells for climate-sensitive `add_burg` / `add_marker`, or feed cells into `get_cell_info` for a localized climate tour. Errors on un-generated map (pack, pack.cells.g, or grid.cells.temp missing), missing / non-integer / out-of-range `min` or `max`, `min > max`, or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        min: {
          type: "integer",
          minimum: MIN_TEMPERATURE,
          maximum: MAX_TEMPERATURE,
          description:
            "Minimum cell temperature in °C, inclusive. Integer in [-128, 127]. Must be <= max.",
        },
        max: {
          type: "integer",
          minimum: MIN_TEMPERATURE,
          maximum: MAX_TEMPERATURE,
          description:
            "Maximum cell temperature in °C, inclusive. Integer in [-128, 127]. Must be >= min.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["min", "max"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        min?: unknown;
        max?: unknown;
        limit?: unknown;
      };

      const min = parseTemperature(input.min, "min");
      if (typeof min === "string") return errorResult(min);

      const max = parseTemperature(input.max, "max");
      if (typeof max === "string") return errorResult(max);

      if (min > max) {
        return errorResult("min must be <= max.");
      }

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.find(min, max, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        min,
        max,
        cells: result.cells,
        count: result.count,
      });
    },
  };
}

export const findCellsByTemperatureRangeTool =
  createFindCellsByTemperatureRangeTool();
