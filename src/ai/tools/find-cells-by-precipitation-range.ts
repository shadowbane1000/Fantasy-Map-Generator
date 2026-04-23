import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT = 10000;
export const MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT = 100000;
export const MIN_PRECIPITATION = 0;
export const MAX_PRECIPITATION = 255;

interface PackLike {
  cells?: {
    g?: ArrayLike<number>;
  };
}

interface GridLike {
  cells?: {
    prec?: ArrayLike<number>;
  };
}

export interface FindCellsByPrecipitationRangeHit {
  cells: number[];
  count: number;
}

export type FindCellsByPrecipitationRangeResult =
  | FindCellsByPrecipitationRangeHit
  | "not-ready";

/**
 * Pure collector: given the world state (`pack` + `grid`) and an inclusive
 * precipitation range `[min, max]`, return every packed-grid cell index `i`
 * where `grid.cells.prec[pack.cells.g[i]]` satisfies
 * `prec >= min && prec <= max`. `count` reports the full unlimited total even
 * when `cells` is truncated by `limit`.
 *
 * Returns `"not-ready"` when pack / pack.cells / pack.cells.g / grid /
 * grid.cells / grid.cells.prec is missing or lacks a numeric `length`.
 */
export function findCellsByPrecipitationRangeInPack(
  pack: PackLike | undefined,
  grid: GridLike | undefined,
  min: number,
  max: number,
  limit: number,
): FindCellsByPrecipitationRangeResult {
  if (!pack || !pack.cells) return "not-ready";
  const g = pack.cells.g;
  if (!g || typeof g.length !== "number") return "not-ready";

  if (!grid || !grid.cells) return "not-ready";
  const prec = grid.cells.prec;
  if (!prec || typeof prec.length !== "number") return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = g.length;
  for (let i = 0; i < length; i++) {
    const gridCell = g[i];
    if (typeof gridCell !== "number") continue;
    if (gridCell < 0 || gridCell >= prec.length) continue;
    const v = prec[gridCell];
    if (v >= min && v <= max) {
      count++;
      if (cells.length < cap) cells.push(i);
    }
  }

  return { cells, count };
}

export interface FindCellsByPrecipitationRangeRuntime {
  find(
    min: number,
    max: number,
    limit: number,
  ): FindCellsByPrecipitationRangeResult;
}

export const defaultFindCellsByPrecipitationRangeRuntime: FindCellsByPrecipitationRangeRuntime =
  {
    find(min, max, limit) {
      return findCellsByPrecipitationRangeInPack(
        getPack<PackLike>(),
        getGlobal<GridLike>("grid"),
        min,
        max,
        limit,
      );
    },
  };

function parsePrecipitation(value: unknown, label: string): number | string {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_PRECIPITATION ||
    value > MAX_PRECIPITATION
  ) {
    return `${label} must be an integer in [${MIN_PRECIPITATION}, ${MAX_PRECIPITATION}].`;
  }
  return value;
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT}].`;
  }
  return value;
}

export function createFindCellsByPrecipitationRangeTool(
  runtime: FindCellsByPrecipitationRangeRuntime = defaultFindCellsByPrecipitationRangeRuntime,
): Tool {
  return {
    name: "find_cells_by_precipitation_range",
    description:
      "List every packed-grid cell index whose precipitation falls inside the inclusive range `[min, max]` — the moisture parallel of `find_cells_by_height_range` (elevation) and `find_cells_by_biome` (biome). Precipitation is not stored on pack cells directly; it lives on the pre-Voronoi base grid at `grid.cells.prec`, accessed via the pack cell's grid-cell pointer (`pack.cells.g[i]`). Values are integers in `[0, 255]` (a Uint8 in the save file) — higher means wetter. Required `min` and `max` are integers in `[0, 255]` and must satisfy `min <= max`; both bounds are inclusive, so `{min: 0, max: 0}` returns every cell with zero precipitation (deep desert) and `{min: 0, max: 255}` returns every cell. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so sweeping ranges (arid zones, wet bands) don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.g` linearly and collects every index where the resolved `grid.cells.prec` value is in range. Returns `{ ok, min, max, cells, count }`. Useful as a first step for bulk moisture-based operations — audit desert cells, find rainforest candidates for `set_biome_icons`, seed rivers in wet zones, feed cells into `get_cell_info` for a localized precipitation tour, or pre-filter cells for `add_burg` / `add_marker`. Errors on un-generated map (pack, pack.cells.g, grid, or grid.cells.prec missing), missing / non-integer / out-of-range `min` or `max`, `min > max`, or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        min: {
          type: "integer",
          minimum: MIN_PRECIPITATION,
          maximum: MAX_PRECIPITATION,
          description:
            "Minimum cell precipitation, inclusive. Integer in [0, 255]. Must be <= max.",
        },
        max: {
          type: "integer",
          minimum: MIN_PRECIPITATION,
          maximum: MAX_PRECIPITATION,
          description:
            "Maximum cell precipitation, inclusive. Integer in [0, 255]. Must be >= min.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT}). \`count\` still reports the full unlimited total.`,
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

      const min = parsePrecipitation(input.min, "min");
      if (typeof min === "string") return errorResult(min);

      const max = parsePrecipitation(input.max, "max");
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

export const findCellsByPrecipitationRangeTool =
  createFindCellsByPrecipitationRangeTool();
