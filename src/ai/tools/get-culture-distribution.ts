import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface CultureDistributionEntry {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  cells_count: number;
  percentage: number;
  area: number;
  population: number;
}

export interface CultureDistribution {
  total_cells: number;
  total_population: number;
  cultures: CultureDistributionEntry[];
}

export interface CultureDistributionPackLike {
  cultures?: RawCulture[];
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeMultiplier(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Pure aggregator: given the world state (`pack`) and the display
 * `populationRate`, compute the distribution of cultures — one entry per
 * non-removed culture (INCLUDING the id-0 Wildlands slot, which unlike
 * religions / states / burgs is a real culture that `get_culture_info`
 * treats as readable) — sorted by `cells_count` descending. Population
 * scales raw `rural + urban` by `populationRate` (with the same
 * `rate <= 0 / NaN -> 1` fallback `list_cultures` uses). Percentage is
 * `cells_count / total_cells * 100` (0 when `total_cells` is 0). Returns
 * `"not-ready"` when `pack` / `pack.cultures` is missing.
 */
export function readCultureDistributionFromPack(
  pack: CultureDistributionPackLike | undefined,
  populationRate: number,
): CultureDistribution | "not-ready" {
  if (!pack?.cultures) return "not-ready";

  const rate = safeMultiplier(populationRate);

  interface WorkingEntry {
    i: number;
    name: string;
    color: string | null;
    type: string | null;
    cells_count: number;
    area: number;
    population: number;
  }

  const working: WorkingEntry[] = [];
  let totalCells = 0;
  let totalPopulation = 0;

  for (const culture of pack.cultures) {
    if (!culture) continue;
    if (culture.removed) continue;

    const cells = numeric(culture.cells);
    const area = numeric(culture.area);
    const rawPop = numeric(culture.rural) + numeric(culture.urban);
    const population = Math.max(0, Math.round(rawPop * rate));

    working.push({
      i: culture.i,
      name: typeof culture.name === "string" ? culture.name : "",
      color: typeof culture.color === "string" ? culture.color : null,
      type: typeof culture.type === "string" ? culture.type : null,
      cells_count: cells,
      area,
      population,
    });

    totalCells += cells;
    totalPopulation += population;
  }

  working.sort((a, b) => b.cells_count - a.cells_count);

  const cultures: CultureDistributionEntry[] = working.map((entry) => ({
    i: entry.i,
    name: entry.name,
    color: entry.color,
    type: entry.type,
    cells_count: entry.cells_count,
    percentage: totalCells > 0 ? (entry.cells_count / totalCells) * 100 : 0,
    area: entry.area,
    population: entry.population,
  }));

  return {
    total_cells: totalCells,
    total_population: totalPopulation,
    cultures,
  };
}

export interface CultureDistributionRuntime {
  readDistribution(): CultureDistribution | "not-ready";
}

export const defaultCultureDistributionRuntime: CultureDistributionRuntime = {
  readDistribution(): CultureDistribution | "not-ready" {
    const pack = getPack<CultureDistributionPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    return readCultureDistributionFromPack(
      pack,
      typeof populationRate === "number" ? populationRate : 1,
    );
  },
};

export function createGetCultureDistributionTool(
  runtime: CultureDistributionRuntime = defaultCultureDistributionRuntime,
): Tool {
  return {
    name: "get_culture_distribution",
    description:
      "Read the aggregate distribution of cultures across the current map — the culture-level parallel of `get_population_stats` / `get_religion_distribution` / `get_biome_distribution` and a companion to `list_cultures` / `find_largest_cultures`. Iterates `pack.cultures` linearly, skipping only `removed: true` entries and **INCLUDING culture id 0 (Wildlands)** — unlike religions / states / burgs where id 0 is a skipped placeholder, the Wildlands slot is a real culture that the Culture Editor and `get_culture_info` treat as readable, so it shows up in the distribution too. Uses the pre-aggregated per-culture fields (`culture.cells`, `culture.area`, `culture.rural + culture.urban`) — no per-cell scan, so it stays O(cultures). Population is computed as `Math.round((rural + urban) × populationRate)` with the same `rate <= 0 / NaN → 1` fallback `list_cultures` uses (NOT multiplied by `urbanization`, since a culture's `rural + urban` is already the combined raw total — same convention `get_religion_distribution` follows). `percentage` is each culture's share of `total_cells` — `cells_count / total_cells × 100`, floating, `0` when `total_cells` is `0`. Returns `{ ok, total_cells, total_population, cultures }` sorted by `cells_count` descending. Each culture is `{ i, name, color, type, cells_count, percentage, area, population }`; `color` / `type` fall back to `null` when the raw culture omits them. `total_cells` is the sum of `culture.cells` over non-removed cultures (INCLUDING Wildlands — cells belonging to the Wildlands slot are still counted here, differently from the religion distribution which excludes id 0). `total_population` is the sum of the per-culture scaled population counts. Accepts no parameters. When the map has no non-removed cultures, `cultures` is `[]`, `total_cells` and `total_population` are `0`, still `ok: true`. Useful for audits (how is cultural territory distributed across the map?), demographic summaries that need per-culture population counts, and deciding which cultures to rename / recolor / retype. Read-only — never mutates the pack. Errors only on un-generated map (pack or `pack.cultures` missing). Requires an Anthropic API key (see 'Getting an API key' below).",
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

export const getCultureDistributionTool = createGetCultureDistributionTool();
