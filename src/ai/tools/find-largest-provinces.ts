import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_LARGEST_PROVINCES_N = 10;
export const MAX_FIND_LARGEST_PROVINCES_N = 500;

export const FIND_LARGEST_PROVINCES_METRICS = [
  "area",
  "cells",
  "population",
] as const;

export type FindLargestProvincesMetric =
  (typeof FIND_LARGEST_PROVINCES_METRICS)[number];

export const DEFAULT_FIND_LARGEST_PROVINCES_BY: FindLargestProvincesMetric =
  "area";

export interface FindLargestProvincesHit {
  i: number;
  name: string;
  fullName: string | null;
  formName: string | null;
  color: string | null;
  area: number;
  cells_count: number;
  population: number;
}

export interface FindLargestProvincesPayload {
  provinces: FindLargestProvincesHit[];
}

export type FindLargestProvincesResult =
  | FindLargestProvincesPayload
  | "not-ready";

interface PackLike {
  provinces?: RawProvince[];
  burgs?: RawBurg[];
  cells?: {
    province?: ArrayLike<number> | number[];
    pop?: ArrayLike<number> | number[];
    area?: ArrayLike<number> | number[];
  };
}

interface Aggregate {
  cellsCount: number;
  area: number;
  ruralRaw: number;
  urbanRaw: number;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readScalar(
  arr: ArrayLike<number> | number[] | undefined,
  idx: number,
): number {
  if (!arr) return 0;
  if (idx < 0 || idx >= arr.length) return 0;
  const v = (arr as ArrayLike<number>)[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function metricValue(
  hit: FindLargestProvincesHit,
  by: FindLargestProvincesMetric,
) {
  if (by === "cells") return hit.cells_count;
  if (by === "population") return hit.population;
  return hit.area;
}

/**
 * Pure ranker: given the world state (`pack`), rank every active province by
 * the chosen metric descending and return the top `n` entries. Provinces do
 * not carry pre-aggregated size/population fields — `area`, `cells_count`
 * and `population` are derived by walking `pack.cells.province` (for area,
 * cell count and rural pop) and `pack.burgs` (for urban pop via each burg's
 * `cell`). Skips the index-0 placeholder and any `removed: true` entry.
 * `"population"` is the **raw** sum (rural cell pop + burg population),
 * NOT multiplied by `populationRate × urbanization` — matches the raw
 * semantics of `find_largest_states` / `find_largest_cultures`.
 *
 * Returns `"not-ready"` when `pack` / `pack.provinces` is missing.
 */
export function findLargestProvincesInPack(
  pack: PackLike | undefined,
  n: number,
  by: FindLargestProvincesMetric,
): FindLargestProvincesResult {
  if (!pack?.provinces) return "not-ready";

  const cap = n > 0 ? n : 0;
  const aggregates = new Map<number, Aggregate>();
  const cellProvince = pack.cells?.province;

  if (cellProvince) {
    const len = cellProvince.length;
    const arr = cellProvince as ArrayLike<number>;
    for (let c = 0; c < len; c++) {
      const pid = arr[c];
      if (typeof pid !== "number" || pid <= 0) continue;
      let agg = aggregates.get(pid);
      if (!agg) {
        agg = { cellsCount: 0, area: 0, ruralRaw: 0, urbanRaw: 0 };
        aggregates.set(pid, agg);
      }
      agg.cellsCount += 1;
      agg.area += readScalar(pack.cells?.area, c);
      agg.ruralRaw += readScalar(pack.cells?.pop, c);
    }
  }

  if (pack.burgs && cellProvince) {
    const arr = cellProvince as ArrayLike<number>;
    const len = arr.length;
    for (const b of pack.burgs) {
      if (!b || b.removed) continue;
      if (b.i === 0) continue;
      if (typeof b.cell !== "number" || b.cell < 0 || b.cell >= len) continue;
      const pid = arr[b.cell];
      if (typeof pid !== "number" || pid <= 0) continue;
      let agg = aggregates.get(pid);
      if (!agg) {
        agg = { cellsCount: 0, area: 0, ruralRaw: 0, urbanRaw: 0 };
        aggregates.set(pid, agg);
      }
      agg.urbanRaw += numeric(b.population);
    }
  }

  const hits: FindLargestProvincesHit[] = [];
  for (const province of pack.provinces) {
    if (!province) continue;
    if (province.i === 0) continue;
    if (province.removed) continue;

    const agg = aggregates.get(province.i);
    const cellsCount = agg?.cellsCount ?? 0;
    const area = agg?.area ?? 0;
    const population = (agg?.ruralRaw ?? 0) + (agg?.urbanRaw ?? 0);

    hits.push({
      i: province.i,
      name: typeof province.name === "string" ? province.name : "",
      fullName:
        typeof province.fullName === "string" ? province.fullName : null,
      formName:
        typeof province.formName === "string" ? province.formName : null,
      color: typeof province.color === "string" ? province.color : null,
      area: Math.max(0, Math.round(area)),
      cells_count: cellsCount,
      population: Math.max(0, Math.round(population)),
    });
  }

  hits.sort((a, b) => metricValue(b, by) - metricValue(a, by));

  return { provinces: hits.slice(0, cap) };
}

export interface FindLargestProvincesRuntime {
  find(n: number, by: FindLargestProvincesMetric): FindLargestProvincesResult;
}

export const defaultFindLargestProvincesRuntime: FindLargestProvincesRuntime = {
  find(n, by) {
    return findLargestProvincesInPack(getPack<PackLike>(), n, by);
  },
};

function parseN(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_PROVINCES_N;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_LARGEST_PROVINCES_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_LARGEST_PROVINCES_N}].`;
  }
  return value;
}

function parseBy(value: unknown): FindLargestProvincesMetric | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_LARGEST_PROVINCES_BY;
  }
  if (typeof value !== "string") {
    return `by must be one of ${JSON.stringify(FIND_LARGEST_PROVINCES_METRICS)}.`;
  }
  const normalized = value.trim().toLowerCase();
  if (
    (FIND_LARGEST_PROVINCES_METRICS as readonly string[]).includes(normalized)
  ) {
    return normalized as FindLargestProvincesMetric;
  }
  return `by must be one of ${JSON.stringify(FIND_LARGEST_PROVINCES_METRICS)}.`;
}

export function createFindLargestProvincesTool(
  runtime: FindLargestProvincesRuntime = defaultFindLargestProvincesRuntime,
): Tool {
  return {
    name: "find_largest_provinces",
    description:
      'Return the top N provinces ranked by a chosen size metric descending — the province-level ranking counterpart to `find_largest_states` / `find_largest_cultures` / `find_largest_religions`, and a faster alternative to paginating through `list_provinces` and sorting client-side. Provinces do not carry pre-aggregated size fields on the raw entry, so all three metrics are **derived**: `"area"` sums `pack.cells.area` over cells where `pack.cells.province === i`; `"cells"` counts those cells; `"population"` is the **raw** sum of `pack.cells.pop` for matching cells plus `burg.population` for non-removed burgs whose cell falls inside the province (same raw units as `find_largest_states` / `find_largest_cultures` — NOT multiplied by `populationRate × urbanization`; `get_province_info.population_total` returns the rate-scaled inhabitant count instead, so reach for that when you need display values). Optional `by` (string, case-insensitive, default `"area"`) picks the metric. Optional `n` (integer in [1, 500], default 10) caps the returned list. Walks `pack.cells.province` once to aggregate area / cell-count / rural pop per province id, then `pack.burgs` once to add urban pop, then iterates `pack.provinces` skipping the index-0 placeholder and any `removed: true` entries; survivors are sorted by the chosen metric desc and sliced to `n`. Returns `{ ok, provinces, count, requested_n, by }` where each province is `{ i, name, fullName, formName, color, area, cells_count, population }`. `count` is the length of the returned `provinces` array (0 <= count <= n) — unlike paginated list tools this does NOT report a pre-slice total. `by` echoes the resolved (lower-cased) metric. When no active provinces exist, `provinces` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack or `pack.provinces` missing), out-of-range `n`, or an unrecognised `by` value. Useful as a first step for top-province audits, ranking the largest subdivisions by territory or population, feeding province ids into `get_province_info`, or prioritising `rename_province` / `set_province_color` / `set_province_form` / `regenerate_province_name` / `regenerate_province_coa` on the largest provinces. Read-only; requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_LARGEST_PROVINCES_N,
          description: `How many top provinces to return (default ${DEFAULT_FIND_LARGEST_PROVINCES_N}, max ${MAX_FIND_LARGEST_PROVINCES_N}).`,
        },
        by: {
          type: "string",
          enum: [...FIND_LARGEST_PROVINCES_METRICS],
          description: `Metric to rank by (case-insensitive, default "${DEFAULT_FIND_LARGEST_PROVINCES_BY}"). "area" sums pack.cells.area over cells whose pack.cells.province === i; "cells" counts those cells; "population" sums raw cell pop + burg population for burgs inside the province (not rate-scaled).`,
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
        !(FIND_LARGEST_PROVINCES_METRICS as readonly string[]).includes(
          parsedBy,
        )
      ) {
        return errorResult(parsedBy);
      }
      const by = parsedBy as FindLargestProvincesMetric;

      const result = runtime.find(n, by);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        provinces: result.provinces,
        count: result.provinces.length,
        requested_n: n,
        by,
      });
    },
  };
}

export const findLargestProvincesTool = createFindLargestProvincesTool();
