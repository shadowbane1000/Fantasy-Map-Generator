import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT = 10000;
export const MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT = 100000;
export const MIN_POPULATION = 0;

interface PackLike {
  cells?: {
    pop?: ArrayLike<number>;
  };
}

export interface FindCellsByPopulationRangeHit {
  cells: number[];
  count: number;
}

export type FindCellsByPopulationRangeResult =
  | FindCellsByPopulationRangeHit
  | "not-ready";

/**
 * Pure collector: given the world state (`pack`) and an inclusive
 * population range `[min, max]`, return every cell index `i` where
 * `pack.cells.pop[i]` satisfies `pop >= min && pop <= max`. `count`
 * reports the full unlimited total even when `cells` is truncated by
 * `limit`.
 *
 * Returns `"not-ready"` when pack / cells / pop field are missing or do
 * not expose a numeric `length`.
 *
 * `pack.cells.pop` is a `Float32Array` of **raw pre-scale** rural
 * population values — multiply by `options.populationRate` to obtain an
 * inhabitant count.
 */
export function findCellsByPopulationRangeInPack(
  pack: PackLike | undefined,
  min: number,
  max: number,
  limit: number,
): FindCellsByPopulationRangeResult {
  if (!pack || !pack.cells) return "not-ready";
  const pop = pack.cells.pop;
  if (!pop || typeof pop.length !== "number") return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = pop.length;
  for (let i = 0; i < length; i++) {
    const v = pop[i];
    if (v >= min && v <= max) {
      count++;
      if (cells.length < cap) cells.push(i);
    }
  }

  return { cells, count };
}

export interface FindCellsByPopulationRangeRuntime {
  find(
    min: number,
    max: number,
    limit: number,
  ): FindCellsByPopulationRangeResult;
}

export const defaultFindCellsByPopulationRangeRuntime: FindCellsByPopulationRangeRuntime =
  {
    find(min, max, limit) {
      return findCellsByPopulationRangeInPack(
        getPack<PackLike>(),
        min,
        max,
        limit,
      );
    },
  };

function parsePopulation(value: unknown, label: string): number | string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < MIN_POPULATION
  ) {
    return `${label} must be a finite number >= ${MIN_POPULATION}.`;
  }
  return value;
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT}].`;
  }
  return value;
}

export function createFindCellsByPopulationRangeTool(
  runtime: FindCellsByPopulationRangeRuntime = defaultFindCellsByPopulationRangeRuntime,
): Tool {
  return {
    name: "find_cells_by_population_range",
    description:
      "List every packed-grid cell index whose rural population (`pack.cells.pop[i]`) falls inside the inclusive range `[min, max]` — the population parallel of `find_cells_by_height_range` (elevation), `find_cells_by_temperature_range` (temperature), and `find_cells_by_precipitation_range` (moisture). Unlike temperature / precipitation, rural population lives directly on the pack (no grid indirection): `pack.cells.pop` is a `Float32Array` sized `pack.cells.i.length`. Values are **raw pre-scale** — the UI multiplies by `options.populationRate` to get inhabitant counts, so a `pop` of `0.5` might mean thousands of actual people depending on the map's population rate. Typical raw values are fractional (`0`, `0.15`, `3.8`, `42.6`), with `0` meaning no rural population (water, uninhabitable, or empty land). Required `min` and `max` are finite numbers `>= 0` (fractional allowed) and must satisfy `min <= max`; both bounds are inclusive, so `{min: 0, max: 0}` returns every cell with zero rural population and `{min: 0, max: Infinity}` would — but the max must be finite, so use a large-enough ceiling like `1e9`. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so sweeping ranges don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.pop` linearly and collects every index where the value is in range. Returns `{ ok, min, max, cells, count }`. Useful as a first step for bulk population-aware operations — find empty wilderness (`{min: 0, max: 0}`), audit densely populated hinterland, seed candidate cells for `add_burg`, place `add_marker` on populated coasts, or feed cells into `get_cell_info` for a localized population tour. Errors on un-generated map (pack or `pack.cells.pop` missing), missing / non-finite / negative `min` or `max`, `min > max`, or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        min: {
          type: "number",
          minimum: MIN_POPULATION,
          description:
            "Minimum raw pre-scale population (`pack.cells.pop`), inclusive. Finite number >= 0. Fractional allowed. Must be <= max.",
        },
        max: {
          type: "number",
          minimum: MIN_POPULATION,
          description:
            "Maximum raw pre-scale population (`pack.cells.pop`), inclusive. Finite number >= 0. Fractional allowed. Must be >= min.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT}). \`count\` still reports the full unlimited total.`,
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

      const min = parsePopulation(input.min, "min");
      if (typeof min === "string") return errorResult(min);

      const max = parsePopulation(input.max, "max");
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

export const findCellsByPopulationRangeTool =
  createFindCellsByPopulationRangeTool();
