import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface BiomeDistributionEntry {
  i: number;
  name: string;
  color: string | null;
  cells_count: number;
  percentage: number;
  area: number;
  burgs_count: number;
}

export interface BiomeDistributionPayload {
  total_cells: number;
  biomes: BiomeDistributionEntry[];
}

export type BiomeDistributionResult = BiomeDistributionPayload | "not-ready";

export interface BiomeDistributionBiomesData {
  i?: number[];
  name?: string[];
  color?: string[];
}

export interface BiomeDistributionPackLike {
  burgs?: Array<
    | {
        i: number;
        cell?: number;
        removed?: boolean;
      }
    | undefined
  >;
  cells?: {
    biome?: ArrayLike<number> | number[];
    area?: ArrayLike<number> | number[];
  };
}

function numericAt(
  array: ArrayLike<number> | number[] | undefined,
  idx: number,
): number {
  if (!array) return 0;
  if (idx < 0 || idx >= array.length) return 0;
  const v = array[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Aggregate per-biome cell / area / burg stats over the whole pack.
 * Returns every biome in `biomesData` (optionally including the
 * `"removed"` sentinel slots when `includeRemoved` is true), sorted by
 * `cells_count` descending with ties broken by biome id ascending.
 *
 * Returns `"not-ready"` when `biomesData.i` is missing or `pack.cells`
 * lacks the `biome` field — those are the same preconditions the rest
 * of the biome tools use.
 */
export function readBiomeDistributionFromPack(
  biomesData: BiomeDistributionBiomesData | undefined,
  pack: BiomeDistributionPackLike | undefined,
  includeRemoved: boolean,
): BiomeDistributionResult {
  if (!biomesData || !Array.isArray(biomesData.i)) return "not-ready";
  const cellBiome = pack?.cells?.biome;
  if (!cellBiome || typeof cellBiome.length !== "number") return "not-ready";

  const cellArea = pack?.cells?.area;
  const totalCells = cellBiome.length;

  // Single pass over cells: tally count + area per biome id.
  const cellStats = new Map<number, { cellsCount: number; area: number }>();
  for (let i = 0; i < totalCells; i++) {
    const id = cellBiome[i];
    if (typeof id !== "number") continue;
    let entry = cellStats.get(id);
    if (!entry) {
      entry = { cellsCount: 0, area: 0 };
      cellStats.set(id, entry);
    }
    entry.cellsCount += 1;
    entry.area += numericAt(cellArea, i);
  }

  // Single pass over burgs: count non-removed burgs landing on each biome.
  const burgStats = new Map<number, number>();
  if (Array.isArray(pack?.burgs)) {
    for (const b of pack.burgs) {
      if (!b || b.removed) continue;
      if (b.i === 0) continue;
      if (typeof b.cell !== "number") continue;
      if (b.cell < 0 || b.cell >= totalCells) continue;
      const id = cellBiome[b.cell];
      if (typeof id !== "number") continue;
      burgStats.set(id, (burgStats.get(id) ?? 0) + 1);
    }
  }

  const ids = biomesData.i;
  const names = Array.isArray(biomesData.name) ? biomesData.name : [];
  const colors = Array.isArray(biomesData.color) ? biomesData.color : [];

  const entries: BiomeDistributionEntry[] = [];
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    if (typeof id !== "number") continue;
    const rawName = names[k];
    const name = typeof rawName === "string" ? rawName : "";
    if (name === "removed" && !includeRemoved) continue;

    const stat = cellStats.get(id) ?? { cellsCount: 0, area: 0 };
    const percentage =
      totalCells > 0 ? round2((stat.cellsCount / totalCells) * 100) : 0;
    const color = colors[k];
    entries.push({
      i: id,
      name,
      color: typeof color === "string" ? color : null,
      cells_count: stat.cellsCount,
      percentage,
      area: stat.area,
      burgs_count: burgStats.get(id) ?? 0,
    });
  }

  entries.sort((a, b) => {
    if (b.cells_count !== a.cells_count) return b.cells_count - a.cells_count;
    return a.i - b.i;
  });

  return { total_cells: totalCells, biomes: entries };
}

export interface BiomeDistributionRuntime {
  read(includeRemoved: boolean): BiomeDistributionResult;
}

export const defaultBiomeDistributionRuntime: BiomeDistributionRuntime = {
  read(includeRemoved: boolean): BiomeDistributionResult {
    const biomesData = getGlobal<BiomeDistributionBiomesData>("biomesData");
    const pack = getPack<BiomeDistributionPackLike>();
    return readBiomeDistributionFromPack(biomesData, pack, includeRemoved);
  },
};

function parseIncludeRemoved(value: unknown): boolean | string {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    return "include_removed must be a boolean.";
  }
  return value;
}

export function createGetBiomeDistributionTool(
  runtime: BiomeDistributionRuntime = defaultBiomeDistributionRuntime,
): Tool {
  return {
    name: "get_biome_distribution",
    description:
      "Read aggregate per-biome statistics for the entire world in a single call — the biome parallel of get_population_stats and a bridge between list_biomes (which only has cell / area counts populated after the Biomes Editor has been opened) and get_biome_info (which aggregates live stats but only for one biome at a time). Walks pack.cells.biome once to tally cells and sum pack.cells.area per biome id, then walks pack.burgs once to count non-removed burgs (skipping the index-0 placeholder) landing on each biome's cells. Optional `include_removed` (boolean, default false) — when true, also emits entries for biome slots whose `biomesData.name[k]` is the sentinel `\"removed\"` (they always report 0 cells / 0 burgs since nothing can be assigned to them); when false, those slots are filtered out, matching findBiomeByRef / get_biome_info behaviour. Returns `{ ok, total_cells, biomes }` where `total_cells` is `pack.cells.biome.length` and each biome entry is `{ i, name, color, cells_count, percentage, area, burgs_count }`. `percentage` is `cells_count / total_cells * 100` rounded to 2 decimals (0 when total_cells is 0). Biomes are sorted by `cells_count` descending with ties broken by biome id ascending. Useful for the \"what's the world's biome makeup?\" report — feeds directly into demographic / ecological dashboards and sanity checks after climate / heightmap changes. Errors only on un-generated map (biomesData missing or pack.cells.biome missing) or non-boolean `include_removed`. Read-only; requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        include_removed: {
          type: "boolean",
          description:
            'When true, also include biome slots whose name is the "removed" sentinel (default false).',
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { include_removed?: unknown };
      const includeRemoved = parseIncludeRemoved(input.include_removed);
      if (typeof includeRemoved === "string")
        return errorResult(includeRemoved);

      const result = runtime.read(includeRemoved);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({
        total_cells: result.total_cells,
        biomes: result.biomes,
      });
    },
  };
}

export const getBiomeDistributionTool = createGetBiomeDistributionTool();
