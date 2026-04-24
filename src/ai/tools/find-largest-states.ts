import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_LARGEST_STATES_N = 10;
export const MAX_FIND_LARGEST_STATES_N = 500;

export const FIND_LARGEST_STATES_METRICS = [
  "area",
  "cells",
  "population",
] as const;

export type FindLargestStatesMetric =
  (typeof FIND_LARGEST_STATES_METRICS)[number];

export const DEFAULT_FIND_LARGEST_STATES_BY: FindLargestStatesMetric = "area";

export interface FindLargestStatesHit {
  i: number;
  name: string;
  fullName: string | null;
  form: string | null;
  color: string | null;
  capital: string | null;
  area: number;
  cells: number;
  population: number;
}

export interface FindLargestStatesPayload {
  states: FindLargestStatesHit[];
}

export type FindLargestStatesResult = FindLargestStatesPayload | "not-ready";

interface PackLike {
  states?: RawState[];
  burgs?: RawBurg[];
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricValue(hit: FindLargestStatesHit, by: FindLargestStatesMetric) {
  if (by === "cells") return hit.cells;
  if (by === "population") return hit.population;
  return hit.area;
}

/**
 * Pure ranker: given the world state (`pack`), rank every active state by the
 * chosen metric descending and return the top `n` entries. Skips the index-0
 * placeholder (Neutrals) and any `removed: true` entry. `"population"` uses
 * the pre-aggregated raw totals `state.rural + state.urban` (same raw units as
 * `find_largest_burgs`, not multiplied by `populationRate × urbanization`).
 *
 * Returns `"not-ready"` when `pack` / `pack.states` is missing.
 */
export function findLargestStatesInPack(
  pack: PackLike | undefined,
  n: number,
  by: FindLargestStatesMetric,
): FindLargestStatesResult {
  if (!pack?.states) return "not-ready";

  const cap = n > 0 ? n : 0;
  const burgs = pack.burgs ?? [];
  const hits: FindLargestStatesHit[] = [];

  for (const state of pack.states) {
    if (!state) continue;
    if (state.i === 0) continue;
    if (state.removed) continue;

    const capitalName =
      typeof state.capital === "number" && state.capital > 0
        ? (burgs[state.capital]?.name ?? null)
        : null;

    hits.push({
      i: state.i,
      name: typeof state.name === "string" ? state.name : "",
      fullName: typeof state.fullName === "string" ? state.fullName : null,
      form: typeof state.form === "string" ? state.form : null,
      color: typeof state.color === "string" ? state.color : null,
      capital: capitalName,
      area: numeric(state.area),
      cells: numeric(state.cells),
      population: numeric(state.rural) + numeric(state.urban),
    });
  }

  hits.sort((a, b) => metricValue(b, by) - metricValue(a, by));

  return { states: hits.slice(0, cap) };
}

export interface FindLargestStatesRuntime {
  find(n: number, by: FindLargestStatesMetric): FindLargestStatesResult;
}

export const defaultFindLargestStatesRuntime: FindLargestStatesRuntime = {
  find(n, by) {
    return findLargestStatesInPack(getPack<PackLike>(), n, by);
  },
};

function parseN(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_STATES_N;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_LARGEST_STATES_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_LARGEST_STATES_N}].`;
  }
  return value;
}

function parseBy(value: unknown): FindLargestStatesMetric | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_STATES_BY;
  }
  if (typeof value !== "string") {
    return `by must be one of ${JSON.stringify(FIND_LARGEST_STATES_METRICS)}.`;
  }
  const normalized = value.trim().toLowerCase();
  if ((FIND_LARGEST_STATES_METRICS as readonly string[]).includes(normalized)) {
    return normalized as FindLargestStatesMetric;
  }
  return `by must be one of ${JSON.stringify(FIND_LARGEST_STATES_METRICS)}.`;
}

export function createFindLargestStatesTool(
  runtime: FindLargestStatesRuntime = defaultFindLargestStatesRuntime,
): Tool {
  return {
    name: "find_largest_states",
    description:
      'Return the top N states ranked by a chosen size metric descending — the state-level ranking counterpart to `find_largest_burgs` and a faster alternative to paginating through `list_states` and sorting client-side. Optional `by` (string, case-insensitive, default `"area"`) picks the metric: `"area"` uses `state.area`, `"cells"` uses `state.cells` (the count of cells assigned to the state), and `"population"` uses the **raw** pre-aggregated total `state.rural + state.urban` (same raw units as `find_largest_burgs`, NOT multiplied by `populationRate × urbanization` — scale on the display side if you need inhabitant counts). Optional `n` (integer in [1, 500], default 10) caps the returned list. Iterates `pack.states` linearly, skipping the index-0 placeholder (Neutrals) and any `removed: true` entries, then sorts the survivors by the chosen metric desc and slices the top `n`. Returns `{ ok, states, count, requested_n, by }` where each state is `{ i, name, fullName, form, color, capital, area, cells, population }`. `capital` is the capital burg\'s current name (from `pack.burgs[state.capital].name`) or `null` when the state has no assigned capital — matches `list_states`. `count` is the length of the returned `states` array (0 ≤ count ≤ n) — unlike paginated list tools this does NOT report a pre-slice total. `by` echoes the resolved (lower-cased) metric. When no active states exist, `states` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack or `pack.states` missing), out-of-range `n`, or an unrecognised `by` value. Useful as a first step for top-power audits, ranking superpowers by territory or population, feeding state ids into `get_state_info`, or prioritising `rename_state` / `set_state_color` / `regenerate_state_name` / `merge_states` on the largest polities. Read-only; requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_LARGEST_STATES_N,
          description: `How many top states to return (default ${DEFAULT_FIND_LARGEST_STATES_N}, max ${MAX_FIND_LARGEST_STATES_N}).`,
        },
        by: {
          type: "string",
          enum: [...FIND_LARGEST_STATES_METRICS],
          description: `Metric to rank by (case-insensitive, default "${DEFAULT_FIND_LARGEST_STATES_BY}"). "area" uses state.area; "cells" uses state.cells; "population" uses raw rural+urban totals (not rate-scaled).`,
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
        !(FIND_LARGEST_STATES_METRICS as readonly string[]).includes(parsedBy)
      ) {
        return errorResult(parsedBy);
      }
      const by = parsedBy as FindLargestStatesMetric;

      const result = runtime.find(n, by);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        states: result.states,
        count: result.states.length,
        requested_n: n,
        by,
      });
    },
  };
}

export const findLargestStatesTool = createFindLargestStatesTool();
