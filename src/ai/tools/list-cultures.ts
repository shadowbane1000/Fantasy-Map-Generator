import {
  createPaginatedListTool,
  getGlobal,
  getPack,
  isActive,
  type RawCulture,
} from "./_shared";
import type { Tool } from "./index";

export interface CultureSummary {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  cells: number;
  area: number;
  population: number;
  base: number | null;
  shield: string | null;
  code: string | null;
}

export interface CulturePackLike {
  cultures?: RawCulture[];
}

export function readCulturesFromPack(
  pack: CulturePackLike | undefined,
  populationRate: number,
): CultureSummary[] | null {
  if (!pack?.cultures) return null;
  const rate =
    Number.isFinite(populationRate) && populationRate > 0 ? populationRate : 1;
  return pack.cultures.filter(isActive).map((c): CultureSummary => {
    const rawPop = (c.rural ?? 0) + (c.urban ?? 0);
    return {
      i: c.i,
      name: c.name ?? "",
      color: c.color ?? null,
      type: c.type ?? null,
      cells: c.cells ?? 0,
      area: c.area ?? 0,
      population: Math.max(0, Math.round(rawPop * rate)),
      base: typeof c.base === "number" ? c.base : null,
      shield: c.shield ?? null,
      code: c.code ?? null,
    };
  });
}

export interface CulturesRuntime {
  readCultures(): CultureSummary[] | null;
}

export const defaultCulturesRuntime: CulturesRuntime = {
  readCultures(): CultureSummary[] | null {
    const populationRate = getGlobal<number>("populationRate");
    const rate = typeof populationRate === "number" ? populationRate : 1;
    return readCulturesFromPack(getPack<CulturePackLike>(), rate);
  },
};

export function createListCulturesTool(
  runtime: CulturesRuntime = defaultCulturesRuntime,
): Tool {
  return createPaginatedListTool<CultureSummary>({
    name: "list_cultures",
    description:
      "List cultures on the current map with name, color, type, cells, area, population, name base, shield, and code. Skips the index-0 Wildlands placeholder and removed cultures. Paginated (limit 1-500, default 100; offset >=0).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of cultures to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of cultures to skip (default 0).",
        },
      },
    },
    collectionKey: "cultures",
    notReadyError:
      "Map is not ready yet; cannot list cultures. Wait for the 'map:generated' event on window.",
    read: () => runtime.readCultures(),
  });
}

export const listCulturesTool = createListCulturesTool();
