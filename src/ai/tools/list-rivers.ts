import { createPaginatedListTool, getPack, type RawRiver } from "./_shared";
import type { Tool } from "./index";

export interface RiverSummary {
  i: number;
  name: string;
  type: string | null;
  length: number;
  discharge: number;
  width: number;
  sourceWidth: number;
  source: number;
  mouth: number;
  parent: number;
  basin: number;
  basinName: string | null;
}

export interface RiverPackLike {
  rivers?: RawRiver[];
}

export function readRiversFromPack(
  pack: RiverPackLike | undefined,
): RiverSummary[] | null {
  if (!pack?.rivers) return null;
  const nameById = new Map<number, string>();
  for (const r of pack.rivers) {
    if (r && !r.removed && typeof r.i === "number") {
      nameById.set(r.i, r.name ?? "");
    }
  }
  return pack.rivers
    .filter((r): r is RawRiver => !!r && !r.removed)
    .map((r): RiverSummary => {
      const basin = typeof r.basin === "number" ? r.basin : 0;
      return {
        i: r.i,
        name: r.name ?? "",
        type: r.type ?? null,
        length: typeof r.length === "number" ? r.length : 0,
        discharge: typeof r.discharge === "number" ? r.discharge : 0,
        width: typeof r.width === "number" ? r.width : 0,
        sourceWidth: typeof r.sourceWidth === "number" ? r.sourceWidth : 0,
        source: typeof r.source === "number" ? r.source : 0,
        mouth: typeof r.mouth === "number" ? r.mouth : 0,
        parent: typeof r.parent === "number" ? r.parent : 0,
        basin,
        basinName: nameById.get(basin) ?? null,
      };
    });
}

export interface RiversRuntime {
  readRivers(): RiverSummary[] | null;
}

export const defaultRiversRuntime: RiversRuntime = {
  readRivers(): RiverSummary[] | null {
    return readRiversFromPack(getPack<RiverPackLike>());
  },
};

export function resolveBasinRef(
  rivers: RiverSummary[],
  ref: number | string,
): number | null {
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0) return null;
    return rivers.some((r) => r.i === ref) ? ref : null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const r of rivers) {
    if ((r.name ?? "").toLowerCase() === needle) return r.i;
  }
  return null;
}

interface RiverFilters {
  basinRef: number | string | null;
  minLength: number | null;
  minDischarge: number | null;
}

export function createListRiversTool(
  runtime: RiversRuntime = defaultRiversRuntime,
): Tool {
  return createPaginatedListTool<RiverSummary, RiverFilters>({
    name: "list_rivers",
    description:
      "List rivers on the current map. Each river reports its id, name, type, length, discharge (m³/s), width, source/mouth cell ids, and basin membership (with the basin river's name). Skips removed rivers. Paginated (limit 1-500, default 100; offset >=0). Optional filters: basin (river id or case-insensitive name — selects all tributaries of that drainage), min_length, min_discharge.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of rivers to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of rivers to skip (default 0).",
        },
        basin: {
          type: ["integer", "string"],
          description:
            "Optional basin filter: numeric river id or case-insensitive river name — all tributaries of that basin are included.",
        },
        min_length: {
          type: "number",
          minimum: 0,
          description: "Optional minimum river length.",
        },
        min_discharge: {
          type: "number",
          minimum: 0,
          description: "Optional minimum river discharge (m³/s).",
        },
      },
    },
    collectionKey: "rivers",
    notReadyError:
      "Map is not ready yet; cannot list rivers. Wait for the 'map:generated' event on window.",
    read: () => runtime.readRivers(),
    parseFilters: (input) => {
      let basinRef: number | string | null = null;
      let minLength: number | null = null;
      let minDischarge: number | null = null;
      if (input.basin !== undefined && input.basin !== null) {
        if (typeof input.basin === "number" && Number.isInteger(input.basin))
          basinRef = input.basin;
        else if (typeof input.basin === "string" && input.basin.trim())
          basinRef = input.basin;
        else return "basin must be an integer id or a non-empty name string.";
      }
      const parseMin = (key: string, raw: unknown): number | null | string => {
        if (raw === undefined || raw === null) return null;
        if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
          return `${key} must be a non-negative finite number.`;
        }
        return raw;
      };
      const lenResult = parseMin("min_length", input.min_length);
      if (typeof lenResult === "string") return lenResult;
      minLength = lenResult;
      const dischResult = parseMin("min_discharge", input.min_discharge);
      if (typeof dischResult === "string") return dischResult;
      minDischarge = dischResult;
      return { basinRef, minLength, minDischarge };
    },
    applyFilters: (items, filters) => {
      let basinId: number | null = null;
      if (filters.basinRef !== null) {
        basinId = resolveBasinRef(items, filters.basinRef);
        if (basinId === null)
          return `Could not resolve basin ${JSON.stringify(filters.basinRef)}.`;
      }
      let filtered = items;
      if (basinId !== null)
        filtered = filtered.filter((r) => r.basin === basinId);
      if (filters.minLength !== null) {
        const min = filters.minLength;
        filtered = filtered.filter((r) => r.length >= min);
      }
      if (filters.minDischarge !== null) {
        const min = filters.minDischarge;
        filtered = filtered.filter((r) => r.discharge >= min);
      }
      return {
        items: filtered,
        echo: {
          filters: {
            basin: basinId,
            min_length: filters.minLength,
            min_discharge: filters.minDischarge,
          },
        },
      };
    },
  });
}

export const listRiversTool = createListRiversTool();
