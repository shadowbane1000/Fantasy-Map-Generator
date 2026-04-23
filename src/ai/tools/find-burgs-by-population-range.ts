import { errorResult, getPack, okResult, type RawBurg } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT = 10000;
export const MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT = 100000;
export const MIN_POPULATION = 0;

interface PackLike {
  burgs?: RawBurg[];
}

export interface FindBurgsByPopulationRangeHit {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
}

export interface FindBurgsByPopulationRangePayload {
  burgs: FindBurgsByPopulationRangeHit[];
  count: number;
}

export type FindBurgsByPopulationRangeResult =
  | FindBurgsByPopulationRangePayload
  | "not-ready";

/**
 * Pure collector: given the world state (`pack`) and an inclusive
 * population range `[min, max]`, return every active burg whose raw
 * `burg.population` satisfies `pop >= min && pop <= max`. Skips the
 * index-0 placeholder, `removed: true` entries, and burgs that don't
 * expose a numeric `population` field. `count` reports the full
 * unlimited total even when `burgs` is truncated by `limit`.
 *
 * Returns `"not-ready"` when `pack` / `pack.burgs` is missing.
 *
 * `burg.population` is the **raw engine value** — the UI multiplies
 * by `populationRate × urbanization` to obtain an inhabitant count.
 */
export function findBurgsByPopulationRangeInPack(
  pack: PackLike | undefined,
  min: number,
  max: number,
  limit: number,
): FindBurgsByPopulationRangeResult {
  if (!pack?.burgs) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const burgs: FindBurgsByPopulationRangeHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    if (typeof b.population !== "number") continue;
    const pop = b.population;
    if (pop < min || pop > max) continue;

    count++;
    if (burgs.length < cap) {
      burgs.push({
        i: b.i,
        name: typeof b.name === "string" ? b.name : "",
        x: typeof b.x === "number" ? b.x : 0,
        y: typeof b.y === "number" ? b.y : 0,
        population: pop,
        capital: b.capital === 1,
      });
    }
  }

  return { burgs, count };
}

export interface FindBurgsByPopulationRangeRuntime {
  find(
    min: number,
    max: number,
    limit: number,
  ): FindBurgsByPopulationRangeResult;
}

export const defaultFindBurgsByPopulationRangeRuntime: FindBurgsByPopulationRangeRuntime =
  {
    find(min, max, limit) {
      return findBurgsByPopulationRangeInPack(
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
    return DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT}].`;
  }
  return value;
}

export function createFindBurgsByPopulationRangeTool(
  runtime: FindBurgsByPopulationRangeRuntime = defaultFindBurgsByPopulationRangeRuntime,
): Tool {
  return {
    name: "find_burgs_by_population_range",
    description:
      "List every active burg (city or town) whose raw `burg.population` falls inside an inclusive range `[min, max]` — the burg parallel of `find_cells_by_population_range` (which scans `pack.cells.pop` for rural population) and a population-filtered companion to `find_burgs_by_state` / `find_burgs_by_culture` / `find_burgs_by_type`. Unlike those filters, this one keys purely on size so the AI can audit burgs across any state / culture at once. `burg.population` is the **raw engine value** — the UI multiplies by `populationRate × urbanization` to get inhabitant counts, so a `population` of `8.5` might mean thousands of actual people depending on the map's rates. Typical raw values are fractional (`0.5`, `1.2`, `8.0`, `42.6`), with very small values for hamlets and larger values for cities; `0` means no inhabitants recorded. At least one of `min` / `max` is required — both are finite numbers `>= 0` (fractional allowed) and must satisfy `min <= max`. Omitted `min` defaults to `0` (the minimum legal population); omitted `max` defaults to `Infinity` (no upper bound). Both bounds are inclusive, so `{min: 0, max: 0}` returns every burg with zero population and `{min: 10}` returns every burg at or above 10. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `burgs` array so sweeping ranges don't blow up the response; `count` reports the full unlimited total even when `burgs` is truncated. Iterates `pack.burgs` linearly, skipping the index-0 placeholder, any `removed: true` burgs, and burgs without a numeric `population` field. Returns `{ ok, min, max, burgs, count }` where each burg is `{ i, name, x, y, population, capital }`. `capital` is `true` only when `burg.capital === 1`. When no burg matches, `burgs` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack or `pack.burgs` missing), both `min` and `max` missing, non-finite / negative `min` or `max`, `min > max`, or out-of-range `limit`. Useful as a first step for bulk size-aware burg operations — find empty burgs (`{min: 0, max: 0}`), audit the top cities (`{min: 20}`), feed burg ids into `get_burg_info`, or filter candidates for `rename_burg` / `set_burg_population` / `move_burg`. Read-only; requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        min: {
          type: "number",
          minimum: MIN_POPULATION,
          description:
            "Minimum raw `burg.population`, inclusive. Finite number >= 0. Fractional allowed. Defaults to 0 when omitted. Must be <= max.",
        },
        max: {
          type: "number",
          minimum: MIN_POPULATION,
          description:
            "Maximum raw `burg.population`, inclusive. Finite number >= 0. Fractional allowed. Defaults to Infinity (no upper bound) when omitted. Must be >= min.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
          description: `Maximum burgs to return in the response (default ${DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        min?: unknown;
        max?: unknown;
        limit?: unknown;
      };

      const hasMin = input.min !== undefined && input.min !== null;
      const hasMax = input.max !== undefined && input.max !== null;
      if (!hasMin && !hasMax) {
        return errorResult("At least one of min or max is required.");
      }

      let min: number;
      if (hasMin) {
        const parsed = parsePopulation(input.min, "min");
        if (typeof parsed === "string") return errorResult(parsed);
        min = parsed;
      } else {
        min = MIN_POPULATION;
      }

      let max: number;
      if (hasMax) {
        const parsed = parsePopulation(input.max, "max");
        if (typeof parsed === "string") return errorResult(parsed);
        max = parsed;
      } else {
        max = Number.POSITIVE_INFINITY;
      }

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
        burgs: result.burgs,
        count: result.count,
      });
    },
  };
}

export const findBurgsByPopulationRangeTool =
  createFindBurgsByPopulationRangeTool();
