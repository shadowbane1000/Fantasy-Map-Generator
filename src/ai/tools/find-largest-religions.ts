import { errorResult, getPack, okResult, type RawReligion } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_LARGEST_RELIGIONS_N = 10;
export const MAX_FIND_LARGEST_RELIGIONS_N = 500;

export const FIND_LARGEST_RELIGIONS_METRICS = [
  "area",
  "cells",
  "population",
] as const;

export type FindLargestReligionsMetric =
  (typeof FIND_LARGEST_RELIGIONS_METRICS)[number];

export const DEFAULT_FIND_LARGEST_RELIGIONS_BY: FindLargestReligionsMetric =
  "area";

export interface FindLargestReligionsHit {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  form: string | null;
  area: number;
  cells: number;
  population: number;
}

export interface FindLargestReligionsPayload {
  religions: FindLargestReligionsHit[];
}

export type FindLargestReligionsResult =
  | FindLargestReligionsPayload
  | "not-ready";

interface PackLike {
  religions?: RawReligion[];
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricValue(
  hit: FindLargestReligionsHit,
  by: FindLargestReligionsMetric,
) {
  if (by === "cells") return hit.cells;
  if (by === "population") return hit.population;
  return hit.area;
}

/**
 * Pure ranker: given the world state (`pack`), rank every active religion by
 * the chosen metric descending and return the top `n` entries. Skips the
 * index-0 placeholder ("No religion") and any `removed: true` entry.
 * `"population"` uses the pre-aggregated raw totals `religion.rural +
 * religion.urban` (same raw units as `find_largest_states`, NOT multiplied by
 * `populationRate × urbanization`).
 *
 * Returns `"not-ready"` when `pack` / `pack.religions` is missing.
 */
export function findLargestReligionsInPack(
  pack: PackLike | undefined,
  n: number,
  by: FindLargestReligionsMetric,
): FindLargestReligionsResult {
  if (!pack?.religions) return "not-ready";

  const cap = n > 0 ? n : 0;
  const hits: FindLargestReligionsHit[] = [];

  for (const religion of pack.religions) {
    if (!religion) continue;
    if (religion.i === 0) continue;
    if (religion.removed) continue;

    hits.push({
      i: religion.i,
      name: typeof religion.name === "string" ? religion.name : "",
      color: typeof religion.color === "string" ? religion.color : null,
      type: typeof religion.type === "string" ? religion.type : null,
      form: typeof religion.form === "string" ? religion.form : null,
      area: numeric(religion.area),
      cells: numeric(religion.cells),
      population: numeric(religion.rural) + numeric(religion.urban),
    });
  }

  hits.sort((a, b) => metricValue(b, by) - metricValue(a, by));

  return { religions: hits.slice(0, cap) };
}

export interface FindLargestReligionsRuntime {
  find(n: number, by: FindLargestReligionsMetric): FindLargestReligionsResult;
}

export const defaultFindLargestReligionsRuntime: FindLargestReligionsRuntime = {
  find(n, by) {
    return findLargestReligionsInPack(getPack<PackLike>(), n, by);
  },
};

function parseN(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_RELIGIONS_N;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_LARGEST_RELIGIONS_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_LARGEST_RELIGIONS_N}].`;
  }
  return value;
}

function parseBy(value: unknown): FindLargestReligionsMetric | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_RELIGIONS_BY;
  }
  if (typeof value !== "string") {
    return `by must be one of ${JSON.stringify(FIND_LARGEST_RELIGIONS_METRICS)}.`;
  }
  const normalized = value.trim().toLowerCase();
  if (
    (FIND_LARGEST_RELIGIONS_METRICS as readonly string[]).includes(normalized)
  ) {
    return normalized as FindLargestReligionsMetric;
  }
  return `by must be one of ${JSON.stringify(FIND_LARGEST_RELIGIONS_METRICS)}.`;
}

export function createFindLargestReligionsTool(
  runtime: FindLargestReligionsRuntime = defaultFindLargestReligionsRuntime,
): Tool {
  return {
    name: "find_largest_religions",
    description:
      'Return the top N religions ranked by a chosen size metric descending — the religion-level ranking counterpart to `find_largest_states` / `find_largest_cultures` and a faster alternative to paginating through `list_religions` and sorting client-side. Optional `by` (string, case-insensitive, default `"area"`) picks the metric: `"area"` uses `religion.area`, `"cells"` uses `religion.cells` (count of cells carrying the religion), and `"population"` uses the **raw** pre-aggregated total `religion.rural + religion.urban` (same raw units as `find_largest_states`, NOT multiplied by `populationRate × urbanization` — scale on the display side if you need inhabitant counts). Optional `n` (integer in [1, 500], default 10) caps the returned list. Iterates `pack.religions` linearly, skipping the index-0 placeholder ("No religion") and any `removed: true` entries, then sorts the survivors by the chosen metric desc and slices the top `n`. Returns `{ ok, religions, count, requested_n, by }` where each religion is `{ i, name, color, type, form, area, cells, population }`. `count` is the length of the returned `religions` array (0 ≤ count ≤ n) — unlike paginated list tools this does NOT report a pre-slice total. `by` echoes the resolved (lower-cased) metric. When no active religions exist, `religions` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack or `pack.religions` missing), out-of-range `n`, or an unrecognised `by` value. Useful as a first step for top-faith audits, ranking dominant religions by territory or adherents, feeding religion ids into `get_religion_info`, or prioritising `rename_religion` / `set_religion_color` / `set_religion_type` / `regenerate_religion_names` on the largest religions. Read-only; requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_LARGEST_RELIGIONS_N,
          description: `How many top religions to return (default ${DEFAULT_FIND_LARGEST_RELIGIONS_N}, max ${MAX_FIND_LARGEST_RELIGIONS_N}).`,
        },
        by: {
          type: "string",
          enum: [...FIND_LARGEST_RELIGIONS_METRICS],
          description: `Metric to rank by (case-insensitive, default "${DEFAULT_FIND_LARGEST_RELIGIONS_BY}"). "area" uses religion.area; "cells" uses religion.cells; "population" uses raw rural+urban totals (not rate-scaled).`,
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
        !(FIND_LARGEST_RELIGIONS_METRICS as readonly string[]).includes(
          parsedBy,
        )
      ) {
        return errorResult(parsedBy);
      }
      const by = parsedBy as FindLargestReligionsMetric;

      const result = runtime.find(n, by);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        religions: result.religions,
        count: result.religions.length,
        requested_n: n,
        by,
      });
    },
  };
}

export const findLargestReligionsTool = createFindLargestReligionsTool();
