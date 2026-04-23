import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT = 10000;
export const MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT = 100000;
export const MIN_HEIGHT = 0;
export const MAX_HEIGHT = 100;

interface PackLike {
  cells?: {
    h?: ArrayLike<number>;
  };
}

export interface FindCellsByHeightRangeHit {
  cells: number[];
  count: number;
}

export type FindCellsByHeightRangeResult =
  | FindCellsByHeightRangeHit
  | "not-ready";

/**
 * Pure collector: given the world state (`pack`) and an inclusive height
 * range `[min, max]`, return every cell index `i` where
 * `pack.cells.h[i]` satisfies `h >= min && h <= max`. `count` reports the
 * full unlimited total even when `cells` is truncated by `limit`.
 *
 * Returns `"not-ready"` when pack / cells / h field are missing or do not
 * expose a numeric `length`.
 */
export function findCellsByHeightRangeInPack(
  pack: PackLike | undefined,
  min: number,
  max: number,
  limit: number,
): FindCellsByHeightRangeResult {
  if (!pack || !pack.cells) return "not-ready";
  const h = pack.cells.h;
  if (!h || typeof h.length !== "number") return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = h.length;
  for (let i = 0; i < length; i++) {
    const v = h[i];
    if (v >= min && v <= max) {
      count++;
      if (cells.length < cap) cells.push(i);
    }
  }

  return { cells, count };
}

export interface FindCellsByHeightRangeRuntime {
  find(min: number, max: number, limit: number): FindCellsByHeightRangeResult;
}

export const defaultFindCellsByHeightRangeRuntime: FindCellsByHeightRangeRuntime =
  {
    find(min, max, limit) {
      return findCellsByHeightRangeInPack(getPack<PackLike>(), min, max, limit);
    },
  };

function parseHeight(value: unknown, label: string): number | string {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_HEIGHT ||
    value > MAX_HEIGHT
  ) {
    return `${label} must be an integer in [${MIN_HEIGHT}, ${MAX_HEIGHT}].`;
  }
  return value;
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT}].`;
  }
  return value;
}

export function createFindCellsByHeightRangeTool(
  runtime: FindCellsByHeightRangeRuntime = defaultFindCellsByHeightRangeRuntime,
): Tool {
  return {
    name: "find_cells_by_height_range",
    description:
      "List every packed-grid cell index whose height (`pack.cells.h[i]`) falls inside the inclusive range `[min, max]` — the elevation parallel of `find_cells_by_biome` (which filters by biome) and `get_entity_cells` (which filters by state / province / culture / religion). Heights are integers in `[0, 100]` in this codebase: `0-19` is water (deep ocean to shallow sea), `20` is shore / sea level (`ELEVATION_NEUTRAL_HEIGHT`), and `21-100` is land (coast → hills → mountains → peaks). Required `min` and `max` are integers in `[0, 100]` and must satisfy `min <= max`; both bounds are inclusive, so `{min: 20, max: 20}` returns every cell exactly at sea level, and `{min: 0, max: 100}` returns every cell. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so sweeping ranges (entire oceans, all land) don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.h` linearly and collects every index where the value is in range. Returns `{ ok, min, max, cells, count }`. Useful as a first step for bulk terrain operations — flatten lowlands (`set_cell_height` per cell), audit highlands, find coastal cells (`{min: 18, max: 25}`), pick peaks for `add_marker`, seed candidate cells for `add_burg`, or feed cells into `get_cell_info` for a localized elevation tour. Errors on un-generated map, missing / non-integer / out-of-range `min` or `max`, `min > max`, or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        min: {
          type: "integer",
          minimum: MIN_HEIGHT,
          maximum: MAX_HEIGHT,
          description:
            "Minimum cell height, inclusive. Integer in [0, 100]. Must be <= max.",
        },
        max: {
          type: "integer",
          minimum: MIN_HEIGHT,
          maximum: MAX_HEIGHT,
          description:
            "Maximum cell height, inclusive. Integer in [0, 100]. Must be >= min.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT}). \`count\` still reports the full unlimited total.`,
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

      const min = parseHeight(input.min, "min");
      if (typeof min === "string") return errorResult(min);

      const max = parseHeight(input.max, "max");
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

export const findCellsByHeightRangeTool = createFindCellsByHeightRangeTool();
