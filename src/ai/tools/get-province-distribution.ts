import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ProvinceDistributionEntry {
  i: number;
  name: string;
  fullName: string | null;
  formName: string | null;
  color: string | null;
  cells_count: number;
  percentage: number;
  area: number;
  population: number;
}

export interface ProvinceDistribution {
  total_cells: number;
  total_population: number;
  provinces: ProvinceDistributionEntry[];
}

export interface ProvinceDistributionPackLike {
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

/**
 * Pure aggregator: given the world state (`pack`), compute the distribution
 * of provinces — one entry per active (non-placeholder, non-removed)
 * province — sorted by derived `cells_count` descending. Provinces do NOT
 * carry pre-aggregated `cells` / `rural` / `urban` fields, so all three of
 * `cells_count`, `area` and `population` are derived: walk
 * `pack.cells.province` once (per-cell) for cell count + area + rural pop,
 * then walk `pack.burgs` once for urban pop (using `burg.cell` →
 * `pack.cells.province[burg.cell]`). Population is the **raw** sum
 * (rural + urban), NOT multiplied by `populationRate × urbanization` —
 * matches the raw semantics of `find_largest_provinces`. Percentage is
 * `cells_count / total_cells * 100` (0 when `total_cells` is 0). Returns
 * `"not-ready"` when `pack` / `pack.provinces` is missing.
 */
export function readProvinceDistributionFromPack(
  pack: ProvinceDistributionPackLike | undefined,
): ProvinceDistribution | "not-ready" {
  if (!pack?.provinces) return "not-ready";

  const aggregates = new Map<number, Aggregate>();
  const cellProvince = pack.cells?.province;

  if (cellProvince) {
    const arr = cellProvince as ArrayLike<number>;
    const len = arr.length;
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

  interface WorkingEntry {
    i: number;
    name: string;
    fullName: string | null;
    formName: string | null;
    color: string | null;
    cells_count: number;
    area: number;
    population: number;
  }

  const working: WorkingEntry[] = [];
  let totalCells = 0;
  let totalPopulation = 0;

  for (const province of pack.provinces) {
    if (!province) continue;
    if (province.i === 0) continue;
    if (province.removed) continue;

    const agg = aggregates.get(province.i);
    const cellsCount = agg?.cellsCount ?? 0;
    const area = Math.max(0, Math.round(agg?.area ?? 0));
    const population = Math.max(
      0,
      Math.round((agg?.ruralRaw ?? 0) + (agg?.urbanRaw ?? 0)),
    );

    working.push({
      i: province.i,
      name: typeof province.name === "string" ? province.name : "",
      fullName:
        typeof province.fullName === "string" ? province.fullName : null,
      formName:
        typeof province.formName === "string" ? province.formName : null,
      color: typeof province.color === "string" ? province.color : null,
      cells_count: cellsCount,
      area,
      population,
    });

    totalCells += cellsCount;
    totalPopulation += population;
  }

  working.sort((a, b) => b.cells_count - a.cells_count);

  const provinces: ProvinceDistributionEntry[] = working.map((entry) => ({
    i: entry.i,
    name: entry.name,
    fullName: entry.fullName,
    formName: entry.formName,
    color: entry.color,
    cells_count: entry.cells_count,
    percentage: totalCells > 0 ? (entry.cells_count / totalCells) * 100 : 0,
    area: entry.area,
    population: entry.population,
  }));

  return {
    total_cells: totalCells,
    total_population: totalPopulation,
    provinces,
  };
}

export interface ProvinceDistributionRuntime {
  readDistribution(): ProvinceDistribution | "not-ready";
}

export const defaultProvinceDistributionRuntime: ProvinceDistributionRuntime = {
  readDistribution(): ProvinceDistribution | "not-ready" {
    const pack = getPack<ProvinceDistributionPackLike>();
    return readProvinceDistributionFromPack(pack);
  },
};

export function createGetProvinceDistributionTool(
  runtime: ProvinceDistributionRuntime = defaultProvinceDistributionRuntime,
): Tool {
  return {
    name: "get_province_distribution",
    description:
      "Read the aggregate distribution of provinces across the current map — the province-level parallel of `get_state_distribution` / `get_culture_distribution` / `get_religion_distribution` and a companion to `list_provinces` / `find_largest_provinces`. Unlike states / cultures / religions (which carry pre-aggregated `cells` / `rural` / `urban` fields), provinces do NOT, so `cells_count`, `area` and `population` are all **derived**: walks `pack.cells.province` once to aggregate per-province id the cell count, area (sum of `pack.cells.area`) and rural pop (sum of `pack.cells.pop`), then walks `pack.burgs` once to add urban pop (skipping removed / index-0 burgs, mapping `burg.cell → pack.cells.province[burg.cell]` and skipping cells on province 0). Then iterates `pack.provinces` linearly, skipping the index-0 placeholder and any `removed: true` entries. Population is the **raw** `ruralRaw + urbanRaw` sum in the same units as `find_largest_provinces` — NOT multiplied by `populationRate × urbanization`; `get_province_info.population_total` returns the rate-scaled inhabitant count instead, so reach for that when you need display values. `percentage` is each province's share of `total_cells` — `cells_count / total_cells × 100`, floating, `0` when `total_cells` is `0`. Returns `{ ok, total_cells, total_population, provinces }` sorted by `cells_count` descending. Each province is `{ i, name, fullName, formName, color, cells_count, percentage, area, population }`; `fullName` / `formName` / `color` fall back to `null` when the raw province omits them. `total_cells` is the sum of derived per-province cell counts over active provinces (NOT the total map cell count — cells without an assigned province sit on id 0 and are excluded). `total_population` is the sum of the raw per-province population values. Accepts no parameters. When the map has no active provinces, `provinces` is `[]`, `total_cells` and `total_population` are `0`, still `ok: true`. Useful for audits (how is territory distributed across subdivisions?), demographic summaries that need per-province population counts, and deciding which provinces to rename / recolor / merge. Read-only — never mutates the pack. Errors only on un-generated map (pack or `pack.provinces` missing). Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const result = runtime.readDistribution();
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getProvinceDistributionTool = createGetProvinceDistributionTool();
