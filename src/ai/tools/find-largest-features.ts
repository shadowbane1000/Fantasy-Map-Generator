import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_LARGEST_FEATURES_N = 10;
export const MAX_FIND_LARGEST_FEATURES_N = 500;

export const FIND_LARGEST_FEATURES_METRICS = ["area", "cells"] as const;

export type FindLargestFeaturesMetric =
  (typeof FIND_LARGEST_FEATURES_METRICS)[number];

export const DEFAULT_FIND_LARGEST_FEATURES_BY: FindLargestFeaturesMetric =
  "area";

export const FIND_LARGEST_FEATURES_TYPE_FILTERS = [
  "island",
  "lake",
  "ocean",
  "continent",
] as const;

export type FindLargestFeaturesTypeFilter =
  (typeof FIND_LARGEST_FEATURES_TYPE_FILTERS)[number];

export interface FindLargestFeaturesHit {
  i: number;
  type: string | null;
  group: string | null;
  name: string | null;
  area: number;
  cells: number;
  land: boolean;
  border: boolean;
}

export interface FindLargestFeaturesPayload {
  features: FindLargestFeaturesHit[];
}

export type FindLargestFeaturesResult =
  | FindLargestFeaturesPayload
  | "not-ready";

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

interface RawFeature {
  i?: number;
  type?: string;
  group?: string;
  name?: string;
  land?: boolean;
  border?: boolean;
  cells?: number;
  area?: number;
}

interface PackLike {
  features?: ArrayLike<RawFeature | 0 | undefined | null>;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metricValue(
  hit: FindLargestFeaturesHit,
  by: FindLargestFeaturesMetric,
) {
  if (by === "cells") return hit.cells;
  return hit.area;
}

/**
 * Pure ranker: given the world state (`pack`), rank every feature by the
 * chosen metric descending and return the top `n` entries. Skips the
 * index-0 placeholder (the generator writes `0` there) and any falsy /
 * non-object slot. An optional `typeFilter` restricts the ranking to
 * matching features: `"continent"` matches `group === "continent"` (since
 * continents share the raw type `"island"`); the others match
 * `type === filter`.
 *
 * Returns `"not-ready"` when `pack` / `pack.features` is missing.
 */
export function findLargestFeaturesInPack(
  pack: PackLike | undefined,
  n: number,
  by: FindLargestFeaturesMetric,
  typeFilter: FindLargestFeaturesTypeFilter | null,
): FindLargestFeaturesResult {
  if (!pack?.features) return "not-ready";

  const cap = n > 0 ? n : 0;
  const features = pack.features;
  const hits: FindLargestFeaturesHit[] = [];

  for (let idx = 1; idx < features.length; idx++) {
    const entry = features[idx];
    if (!entry || typeof entry !== "object") continue;

    const i = typeof entry.i === "number" ? entry.i : idx;
    const type = typeof entry.type === "string" ? entry.type : null;
    const group = typeof entry.group === "string" ? entry.group : null;
    const name =
      typeof entry.name === "string" && entry.name.length > 0
        ? entry.name
        : null;
    const land = entry.land === true;
    const border = entry.border === true;
    const cells = numeric(entry.cells);
    const area = numeric(entry.area);

    if (typeFilter !== null) {
      if (typeFilter === "continent") {
        if (group !== "continent") continue;
      } else {
        if (type !== typeFilter) continue;
      }
    }

    hits.push({ i, type, group, name, area, cells, land, border });
  }

  hits.sort((a, b) => metricValue(b, by) - metricValue(a, by));

  return { features: hits.slice(0, cap) };
}

export interface FindLargestFeaturesRuntime {
  find(
    n: number,
    by: FindLargestFeaturesMetric,
    typeFilter: FindLargestFeaturesTypeFilter | null,
  ): FindLargestFeaturesResult;
}

export const defaultFindLargestFeaturesRuntime: FindLargestFeaturesRuntime = {
  find(n, by, typeFilter) {
    return findLargestFeaturesInPack(getPack<PackLike>(), n, by, typeFilter);
  },
};

function parseN(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_FEATURES_N;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_LARGEST_FEATURES_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_LARGEST_FEATURES_N}].`;
  }
  return value;
}

function parseBy(value: unknown): FindLargestFeaturesMetric | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_FEATURES_BY;
  }
  if (typeof value !== "string") {
    return `by must be one of ${JSON.stringify(FIND_LARGEST_FEATURES_METRICS)}.`;
  }
  const normalized = value.trim().toLowerCase();
  if (
    (FIND_LARGEST_FEATURES_METRICS as readonly string[]).includes(normalized)
  ) {
    return normalized as FindLargestFeaturesMetric;
  }
  return `by must be one of ${JSON.stringify(FIND_LARGEST_FEATURES_METRICS)}.`;
}

function parseType(
  value: unknown,
): FindLargestFeaturesTypeFilter | null | string {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    return `type must be one of ${JSON.stringify(FIND_LARGEST_FEATURES_TYPE_FILTERS)}.`;
  }
  const normalized = value.trim().toLowerCase();
  if (
    (FIND_LARGEST_FEATURES_TYPE_FILTERS as readonly string[]).includes(
      normalized,
    )
  ) {
    return normalized as FindLargestFeaturesTypeFilter;
  }
  return `type must be one of ${JSON.stringify(FIND_LARGEST_FEATURES_TYPE_FILTERS)}.`;
}

export function createFindLargestFeaturesTool(
  runtime: FindLargestFeaturesRuntime = defaultFindLargestFeaturesRuntime,
): Tool {
  return {
    name: "find_largest_features",
    description:
      'Return the top N features (continents / islands / lakes / oceans) ranked by a chosen size metric descending — the feature-level ranking counterpart to `find_largest_states` / `find_largest_cultures` / `find_largest_religions` and a faster alternative to paginating through `list_features` and sorting client-side. Features are the entries in `pack.features` produced by the feature-marking pass on the packed Voronoi graph (the same objects `get_feature_info` returns detail for). Optional `by` (string, case-insensitive, default `"area"`) picks the metric: `"area"` uses `feature.area`, `"cells"` uses `feature.cells` (the count of cells in the feature). Optional `type` (string, case-insensitive) filters to a single kind — `"island"`, `"lake"`, `"ocean"`, or `"continent"`. `"continent"` is a convenience alias matching features whose `group` is `"continent"` (continents share the raw type `"island"` with non-continent landmasses — same semantics as `list_features`). When `type` is omitted, all kinds are included in the ranking. Optional `n` (integer in [1, 500], default 10) caps the returned list. Iterates `pack.features` linearly, skipping the index-0 placeholder the generator writes as `0` along with any non-object / falsy slot, applying the type filter, then sorts the survivors by the chosen metric desc and slices the top `n`. Returns `{ ok, features, count, requested_n, by, type_filter }` where each feature is `{ i, type, group, name, area, cells, land, border }`. `name` is `null` when absent or empty (some oceans lack names). `border` is `true` when the feature touches the map edge. `count` is the length of the returned `features` array (0 ≤ count ≤ n) — unlike paginated list tools this does NOT report a pre-slice total. `by` echoes the resolved (lower-cased) metric; `type_filter` echoes the resolved (lower-cased) type filter or `null` when no filter is active. When no matching features exist, `features` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack or `pack.features` missing), out-of-range `n`, an unrecognised `by` value, or an unrecognised `type` value. Useful as a first step for identifying the dominant landmass, the biggest ocean, the largest freshwater lake, feeding feature ids into `get_feature_info`, or prioritising downstream passes (burg placement, marker drops, zone shaping) on the most prominent features. Read-only; requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_LARGEST_FEATURES_N,
          description: `How many top features to return (default ${DEFAULT_FIND_LARGEST_FEATURES_N}, max ${MAX_FIND_LARGEST_FEATURES_N}).`,
        },
        by: {
          type: "string",
          enum: [...FIND_LARGEST_FEATURES_METRICS],
          description: `Metric to rank by (case-insensitive, default "${DEFAULT_FIND_LARGEST_FEATURES_BY}"). "area" uses feature.area; "cells" uses feature.cells.`,
        },
        type: {
          type: "string",
          enum: [...FIND_LARGEST_FEATURES_TYPE_FILTERS],
          description:
            "Optional type filter (case-insensitive). 'island', 'lake', 'ocean', or 'continent'. 'continent' matches features whose group is 'continent'. Omit to include all types.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        n?: unknown;
        by?: unknown;
        type?: unknown;
      };

      const parsedN = parseN(input.n);
      if (typeof parsedN === "string") return errorResult(parsedN);
      const n = parsedN;

      const parsedBy = parseBy(input.by);
      if (
        !(FIND_LARGEST_FEATURES_METRICS as readonly string[]).includes(parsedBy)
      ) {
        return errorResult(parsedBy);
      }
      const by = parsedBy as FindLargestFeaturesMetric;

      const parsedType = parseType(input.type);
      if (
        typeof parsedType === "string" &&
        !(FIND_LARGEST_FEATURES_TYPE_FILTERS as readonly string[]).includes(
          parsedType,
        )
      ) {
        return errorResult(parsedType);
      }
      const typeFilter = parsedType as FindLargestFeaturesTypeFilter | null;

      const result = runtime.find(n, by, typeFilter);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        features: result.features,
        count: result.features.length,
        requested_n: n,
        by,
        type_filter: typeFilter,
      });
    },
  };
}

export const findLargestFeaturesTool = createFindLargestFeaturesTool();
