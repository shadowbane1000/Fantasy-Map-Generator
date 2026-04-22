import { createPaginatedListTool, getGlobal } from "./_shared";
import type { Tool } from "./index";

export interface BiomeSummary {
  i: number;
  name: string;
  color: string;
  habitability: number;
  iconsDensity: number;
  cost: number;
  cells: number;
  area: number;
  rural: number;
  urban: number;
  population: number;
}

export interface BiomesData {
  i: number[];
  name: string[];
  color: string[];
  habitability: number[];
  iconsDensity: number[];
  cost: number[];
  cells?: number[];
  area?: number[];
  rural?: number[];
  urban?: number[];
}

function at(array: number[] | undefined, idx: number): number {
  if (!array) return 0;
  const v = array[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function readBiomesFromPack(
  biomesData: BiomesData | undefined,
  populationRate: number,
): BiomeSummary[] | null {
  if (!biomesData || !Array.isArray(biomesData.i)) return null;
  const rate =
    Number.isFinite(populationRate) && populationRate > 0 ? populationRate : 1;
  return biomesData.i.map((id, k): BiomeSummary => {
    const rural = at(biomesData.rural, k);
    const urban = at(biomesData.urban, k);
    return {
      i: id,
      name: biomesData.name?.[k] ?? "",
      color: biomesData.color?.[k] ?? "",
      habitability: biomesData.habitability?.[k] ?? 0,
      iconsDensity: biomesData.iconsDensity?.[k] ?? 0,
      cost: biomesData.cost?.[k] ?? 0,
      cells: at(biomesData.cells, k),
      area: at(biomesData.area, k),
      rural,
      urban,
      population: Math.max(0, Math.round((rural + urban) * rate)),
    };
  });
}

export interface BiomesRuntime {
  readBiomes(): BiomeSummary[] | null;
}

export const defaultBiomesRuntime: BiomesRuntime = {
  readBiomes(): BiomeSummary[] | null {
    const biomesData = getGlobal<BiomesData>("biomesData");
    const populationRate = getGlobal<number>("populationRate");
    const rate = typeof populationRate === "number" ? populationRate : 1;
    return readBiomesFromPack(biomesData, rate);
  },
};

export function createListBiomesTool(
  runtime: BiomesRuntime = defaultBiomesRuntime,
): Tool {
  return createPaginatedListTool<BiomeSummary>({
    name: "list_biomes",
    description:
      "List biomes on the map (13 defaults — Marine, Hot desert, Cold desert, Savanna, Grassland, Tropical seasonal forest, Temperate deciduous forest, Tropical rainforest, Temperate rainforest, Taiga, Tundra, Glacier, Wetland — plus any user-added). Each entry reports id, name, color, habitability, iconsDensity, cost. Per-biome stats (cells / area / rural / urban / scaled population) are populated after the Biomes Editor has been opened; they default to 0 otherwise. Paginated.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of biomes to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of biomes to skip (default 0).",
        },
      },
    },
    collectionKey: "biomes",
    notReadyError:
      "Biomes data is not available yet; wait for the map to finish loading.",
    read: () => runtime.readBiomes(),
  });
}

export const listBiomesTool = createListBiomesTool();
