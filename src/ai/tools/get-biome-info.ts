import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

export interface BiomeInfo {
  i: number;
  name: string;
  color: string | null;
  habitability: number;
  iconsDensity: number;
  icons: string[];
  cost: number;
  cells_count: number;
  area: number;
  population_total: number;
  burgs_count: number;
}

export type ReadBiomeInfoResult = BiomeInfo | "not-ready" | "not-found";

export interface BiomeInfoBiomesData {
  i?: number[];
  name?: string[];
  color?: string[];
  habitability?: number[];
  iconsDensity?: number[];
  icons?: Array<string[] | undefined>;
  cost?: number[];
}

export interface BiomeInfoPackLike {
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
    pop?: ArrayLike<number> | number[];
  };
}

function safeRate(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function copyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") out.push(entry);
  }
  return out;
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

export function readBiomeInfoFromPack(
  biomesData: BiomeInfoBiomesData | undefined,
  pack: BiomeInfoPackLike | undefined,
  populationRate: number,
  ref: number | string,
): ReadBiomeInfoResult {
  if (
    !biomesData ||
    !Array.isArray(biomesData.i) ||
    !Array.isArray(biomesData.name)
  ) {
    return "not-ready";
  }

  const res = findBiomeByRef(biomesData, ref);
  if (!res) return "not-found";

  const k = res.k;
  const biomeI = res.id;

  const color = biomesData.color?.[k];
  const habitability = biomesData.habitability?.[k];
  const iconsDensity = biomesData.iconsDensity?.[k];
  const cost = biomesData.cost?.[k];
  const icons = copyStringArray(biomesData.icons?.[k]);

  let cellsCount = 0;
  let areaTotal = 0;
  let popTotal = 0;
  const rate = safeRate(populationRate);

  const cellBiome = pack?.cells?.biome;
  const cellArea = pack?.cells?.area;
  const cellPop = pack?.cells?.pop;

  if (cellBiome && typeof cellBiome.length === "number") {
    for (let i = 0; i < cellBiome.length; i++) {
      if (cellBiome[i] !== biomeI) continue;
      cellsCount += 1;
      areaTotal += numericAt(cellArea, i);
      popTotal += numericAt(cellPop, i);
    }
  }

  let burgsCount = 0;
  if (pack?.burgs && cellBiome) {
    for (const b of pack.burgs) {
      if (!b || b.removed) continue;
      if (b.i === 0) continue;
      if (typeof b.cell !== "number") continue;
      if (b.cell < 0 || b.cell >= cellBiome.length) continue;
      if (cellBiome[b.cell] === biomeI) burgsCount += 1;
    }
  }

  return {
    i: biomeI,
    name: res.name,
    color: typeof color === "string" ? color : null,
    habitability: typeof habitability === "number" ? habitability : 0,
    iconsDensity: typeof iconsDensity === "number" ? iconsDensity : 0,
    icons,
    cost: typeof cost === "number" ? cost : 0,
    cells_count: cellsCount,
    area: areaTotal,
    population_total: Math.max(0, Math.round(popTotal * rate)),
    burgs_count: burgsCount,
  };
}

export interface BiomeInfoRuntime {
  readBiome(ref: number | string): ReadBiomeInfoResult;
}

export const defaultBiomeInfoRuntime: BiomeInfoRuntime = {
  readBiome(ref: number | string): ReadBiomeInfoResult {
    const biomesData = getGlobal<BiomeInfoBiomesData>("biomesData");
    const pack = getPack<BiomeInfoPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    return readBiomeInfoFromPack(
      biomesData,
      pack,
      typeof populationRate === "number" ? populationRate : 1,
      ref,
    );
  },
};

function parseBiomeRef(
  value: unknown,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error:
      "biome must be a non-negative integer id or a non-empty name string.",
  };
}

export function createGetBiomeInfoTool(
  runtime: BiomeInfoRuntime = defaultBiomeInfoRuntime,
): Tool {
  return {
    name: "get_biome_info",
    description:
      "Read detailed info for a single biome — the per-biome parallel of get_state_info / get_culture_info / get_religion_info. Required `biome` identifies the biome by numeric id (>= 0; id 0 = Marine is allowed, unlike states / burgs) or case-insensitive current biome name (resolved via the shared findBiomeByRef; biomes whose name slot is the sentinel 'removed' are skipped). Returns `i`, `name`, `color`, `habitability`, `iconsDensity`, `icons` (flat string[] copy of biomesData.icons[k] — duplicates preserved as frequency weights, same shape set_biome_icons writes), `cost` (biome movement cost), `cells_count` (live count of cells where pack.cells.biome[i] === biome.i — unlike list_biomes this is always current, not just after the Biomes Editor is opened), `area` (sum of pack.cells.area over those cells; 0 when the pack lacks per-cell area), `population_total` (sum of pack.cells.pop over those cells scaled by populationRate, rounded), and `burgs_count` (live count of non-removed burgs whose cell sits on this biome). Useful before taking any biome-targeted action (rename_biome, set_biome_color, set_biome_cost, set_biome_habitability, set_biome_icons, set_biome_icons_density, remove_biome — note remove_biome only deletes custom biomes at id >= 13). Errors on un-generated map, unresolvable ref, or a biome whose slot was retired via the 'removed' sentinel. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine is allowed) or case-insensitive current biome name.",
        },
      },
      required: ["biome"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { biome?: unknown };
      const parsed = parseBiomeRef(input.biome);
      if (!parsed.ok) return errorResult(parsed.error);

      const result = runtime.readBiome(parsed.ref);
      if (result === "not-ready") {
        return errorResult(
          "Biomes data is not available yet; wait for the map to finish loading.",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No biome found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getBiomeInfoTool = createGetBiomeInfoTool();
