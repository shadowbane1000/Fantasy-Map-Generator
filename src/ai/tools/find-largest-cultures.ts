import { errorResult, getPack, okResult, type RawCulture } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_LARGEST_CULTURES_N = 10;
export const MAX_FIND_LARGEST_CULTURES_N = 500;

export const FIND_LARGEST_CULTURES_METRICS = [
  "area",
  "cells",
  "population",
] as const;

export type FindLargestCulturesMetric =
  (typeof FIND_LARGEST_CULTURES_METRICS)[number];

export const DEFAULT_FIND_LARGEST_CULTURES_BY: FindLargestCulturesMetric =
  "area";

export interface FindLargestCulturesHit {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  area: number;
  cells: number;
  population: number;
}

export interface FindLargestCulturesPayload {
  cultures: FindLargestCulturesHit[];
}

export type FindLargestCulturesResult =
  | FindLargestCulturesPayload
  | "not-ready";

interface PackLike {
  cultures?: RawCulture[];
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricValue(
  hit: FindLargestCulturesHit,
  by: FindLargestCulturesMetric,
) {
  if (by === "cells") return hit.cells;
  if (by === "population") return hit.population;
  return hit.area;
}

/**
 * Pure ranker: given the world state (`pack`), rank every active culture by
 * the chosen metric descending and return the top `n` entries. Skips the
 * index-0 Wildlands placeholder and any `removed: true` entry. `"population"`
 * uses the pre-aggregated raw totals `culture.rural + culture.urban` (same
 * raw units as `find_largest_burgs` / `find_largest_states`, not multiplied
 * by `populationRate × urbanization`).
 *
 * Returns `"not-ready"` when `pack` / `pack.cultures` is missing.
 */
export function findLargestCulturesInPack(
  pack: PackLike | undefined,
  n: number,
  by: FindLargestCulturesMetric,
): FindLargestCulturesResult {
  if (!pack?.cultures) return "not-ready";

  const cap = n > 0 ? n : 0;
  const hits: FindLargestCulturesHit[] = [];

  for (const culture of pack.cultures) {
    if (!culture) continue;
    if (culture.i === 0) continue;
    if (culture.removed) continue;

    hits.push({
      i: culture.i,
      name: typeof culture.name === "string" ? culture.name : "",
      color: typeof culture.color === "string" ? culture.color : null,
      type: typeof culture.type === "string" ? culture.type : null,
      area: numeric(culture.area),
      cells: numeric(culture.cells),
      population: numeric(culture.rural) + numeric(culture.urban),
    });
  }

  hits.sort((a, b) => metricValue(b, by) - metricValue(a, by));

  return { cultures: hits.slice(0, cap) };
}

export interface FindLargestCulturesRuntime {
  find(n: number, by: FindLargestCulturesMetric): FindLargestCulturesResult;
}

export const defaultFindLargestCulturesRuntime: FindLargestCulturesRuntime = {
  find(n, by) {
    return findLargestCulturesInPack(getPack<PackLike>(), n, by);
  },
};

function parseN(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_CULTURES_N;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_LARGEST_CULTURES_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_LARGEST_CULTURES_N}].`;
  }
  return value;
}

function parseBy(value: unknown): FindLargestCulturesMetric | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_CULTURES_BY;
  }
  if (typeof value !== "string") {
    return `by must be one of ${JSON.stringify(FIND_LARGEST_CULTURES_METRICS)}.`;
  }
  const normalized = value.trim().toLowerCase();
  if (
    (FIND_LARGEST_CULTURES_METRICS as readonly string[]).includes(normalized)
  ) {
    return normalized as FindLargestCulturesMetric;
  }
  return `by must be one of ${JSON.stringify(FIND_LARGEST_CULTURES_METRICS)}.`;
}

export function createFindLargestCulturesTool(
  runtime: FindLargestCulturesRuntime = defaultFindLargestCulturesRuntime,
): Tool {
  return {
    name: "find_largest_cultures",
    description:
      'Return the top N cultures ranked by a chosen size metric descending — the culture-level ranking counterpart to `find_largest_states` and `find_largest_burgs`, and a faster alternative to paginating through `list_cultures` and sorting client-side. Optional `by` (string, case-insensitive, default `"area"`) picks the metric: `"area"` uses `culture.area`, `"cells"` uses `culture.cells` (the count of cells assigned to the culture), and `"population"` uses the **raw** pre-aggregated total `culture.rural + culture.urban` (same raw units as `find_largest_states` / `find_largest_burgs`, NOT multiplied by `populationRate × urbanization` — scale on the display side if you need inhabitant counts; `list_cultures` and `get_culture_info` return rate-scaled values instead). Optional `n` (integer in [1, 500], default 10) caps the returned list. Iterates `pack.cultures` linearly, skipping the index-0 Wildlands placeholder and any `removed: true` entries, then sorts the survivors by the chosen metric desc and slices the top `n`. Returns `{ ok, cultures, count, requested_n, by }` where each culture is `{ i, name, color, type, area, cells, population }`. `count` is the length of the returned `cultures` array (0 ≤ count ≤ n) — unlike paginated list tools this does NOT report a pre-slice total. `by` echoes the resolved (lower-cased) metric. When no active cultures exist, `cultures` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack or `pack.cultures` missing), out-of-range `n`, or an unrecognised `by` value. Useful as a first step for dominant-culture audits, ranking the most widespread peoples by territory or population, feeding culture ids into `get_culture_info`, or prioritising `rename_culture` / `set_culture_color` / `set_culture_type` / `regenerate_all_culture_names` on the largest cultures. Read-only; requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_LARGEST_CULTURES_N,
          description: `How many top cultures to return (default ${DEFAULT_FIND_LARGEST_CULTURES_N}, max ${MAX_FIND_LARGEST_CULTURES_N}).`,
        },
        by: {
          type: "string",
          enum: [...FIND_LARGEST_CULTURES_METRICS],
          description: `Metric to rank by (case-insensitive, default "${DEFAULT_FIND_LARGEST_CULTURES_BY}"). "area" uses culture.area; "cells" uses culture.cells; "population" uses raw rural+urban totals (not rate-scaled).`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { n?: unknown; by?: unknown };

      const parsedN = parseN(input.n);
      if (typeof parsedN === "string") return errorResult(parsedN);
      const n = parsedN;

      const parsedBy = parseBy(input.by);
      if (
        !(FIND_LARGEST_CULTURES_METRICS as readonly string[]).includes(parsedBy)
      ) {
        return errorResult(parsedBy);
      }
      const by = parsedBy as FindLargestCulturesMetric;

      const result = runtime.find(n, by);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        cultures: result.cultures,
        count: result.cultures.length,
        requested_n: n,
        by,
      });
    },
  };
}

export const findLargestCulturesTool = createFindLargestCulturesTool();
