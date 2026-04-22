import {
  createPaginatedListTool,
  getGlobal,
  getPack,
  isActive,
  type RawCulture,
  type RawReligion,
} from "./_shared";
import type { Tool } from "./index";

export interface ReligionSummary {
  i: number;
  name: string;
  type: string | null;
  form: string | null;
  deity: string | null;
  color: string | null;
  culture: string | null;
  cultureId: number;
  cells: number;
  area: number;
  population: number;
  expansion: string | null;
  code: string | null;
}

export interface ReligionPackLike {
  religions?: RawReligion[];
  cultures?: RawCulture[];
}

export function readReligionsFromPack(
  pack: ReligionPackLike | undefined,
  populationRate: number,
): ReligionSummary[] | null {
  if (!pack?.religions) return null;
  const cultures = pack.cultures ?? [];
  const rate =
    Number.isFinite(populationRate) && populationRate > 0 ? populationRate : 1;
  return pack.religions.filter(isActive).map((r): ReligionSummary => {
    const rawPop = (r.rural ?? 0) + (r.urban ?? 0);
    const cultureId = typeof r.culture === "number" ? r.culture : 0;
    return {
      i: r.i,
      name: r.name ?? "",
      type: r.type ?? null,
      form: r.form ?? null,
      deity: typeof r.deity === "string" ? r.deity : null,
      color: r.color ?? null,
      culture: cultures[cultureId]?.name ?? null,
      cultureId,
      cells: r.cells ?? 0,
      area: r.area ?? 0,
      population: Math.max(0, Math.round(rawPop * rate)),
      expansion: r.expansion ?? null,
      code: r.code ?? null,
    };
  });
}

export interface ReligionsRuntime {
  readReligions(): ReligionSummary[] | null;
}

export const defaultReligionsRuntime: ReligionsRuntime = {
  readReligions(): ReligionSummary[] | null {
    const populationRate = getGlobal<number>("populationRate");
    const rate = typeof populationRate === "number" ? populationRate : 1;
    return readReligionsFromPack(getPack<ReligionPackLike>(), rate);
  },
};

export function createListReligionsTool(
  runtime: ReligionsRuntime = defaultReligionsRuntime,
): Tool {
  return createPaginatedListTool<ReligionSummary>({
    name: "list_religions",
    description:
      "List religions on the current map with name, type (Folk/Organized/Cult/Heresy), form, deity, color, culture name, cells, area, population, expansion mode, and code. Skips the index-0 placeholder and removed entries. Paginated (limit 1-500, default 100; offset >=0).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of religions to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of religions to skip (default 0).",
        },
      },
    },
    collectionKey: "religions",
    notReadyError:
      "Map is not ready yet; cannot list religions. Wait for the 'map:generated' event on window.",
    read: () => runtime.readReligions(),
  });
}

export const listReligionsTool = createListReligionsTool();
