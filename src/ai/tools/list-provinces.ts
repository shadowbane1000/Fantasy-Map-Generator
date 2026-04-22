import {
  createPaginatedListTool,
  getPack,
  isActive,
  type RawBurg,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool } from "./index";
import { resolveStateRefInPack } from "./list-burgs";

export interface ProvinceSummary {
  i: number;
  name: string;
  fullName: string | null;
  formName: string | null;
  color: string | null;
  state: string | null;
  stateId: number;
  burg: string | null;
  burgId: number;
  pole: [number, number] | null;
}

export interface ProvincePackLike {
  provinces?: RawProvince[];
  states?: RawState[];
  burgs?: RawBurg[];
}

export function readProvincesFromPack(
  pack: ProvincePackLike | undefined,
): ProvinceSummary[] | null {
  if (!pack?.provinces) return null;
  const states = pack.states ?? [];
  const burgs = pack.burgs ?? [];
  return pack.provinces.filter(isActive).map((p): ProvinceSummary => {
    const stateId = typeof p.state === "number" ? p.state : 0;
    const burgId = typeof p.burg === "number" ? p.burg : 0;
    const pole =
      Array.isArray(p.pole) &&
      typeof p.pole[0] === "number" &&
      typeof p.pole[1] === "number"
        ? ([p.pole[0], p.pole[1]] as [number, number])
        : null;
    return {
      i: p.i,
      name: p.name ?? "",
      fullName: p.fullName ?? null,
      formName: p.formName ?? null,
      color: p.color ?? null,
      state: states[stateId]?.name ?? null,
      stateId,
      burg: burgId > 0 ? (burgs[burgId]?.name ?? null) : null,
      burgId,
      pole,
    };
  });
}

export interface ProvincesRuntime {
  readProvinces(): ProvinceSummary[] | null;
  resolveStateRef(ref: number | string): number | null;
}

export const defaultProvincesRuntime: ProvincesRuntime = {
  readProvinces(): ProvinceSummary[] | null {
    return readProvincesFromPack(getPack<ProvincePackLike>());
  },
  resolveStateRef(ref) {
    return resolveStateRefInPack(getPack<ProvincePackLike>(), ref);
  },
};

interface ProvinceFilters {
  stateRef: number | string | null;
}

export function createListProvincesTool(
  runtime: ProvincesRuntime = defaultProvincesRuntime,
): Tool {
  return createPaginatedListTool<ProvinceSummary, ProvinceFilters>({
    name: "list_provinces",
    description:
      "List provinces on the current map with name, fullName, formName, color, parent state, capital burg, and pole coordinates. Skips the index-0 placeholder and removed provinces. Paginated (limit 1-500 default 100; offset >=0). Optional state filter accepts an id or a case-insensitive state name.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of provinces to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of provinces to skip (default 0).",
        },
        state: {
          type: ["integer", "string"],
          description:
            "Optional parent-state filter: numeric id or case-insensitive state name / fullName.",
        },
      },
    },
    collectionKey: "provinces",
    notReadyError:
      "Map is not ready yet; cannot list provinces. Wait for the 'map:generated' event on window.",
    read: () => runtime.readProvinces(),
    parseFilters: (input) => {
      let stateRef: number | string | null = null;
      if (input.state !== undefined && input.state !== null) {
        if (typeof input.state === "number" && Number.isInteger(input.state))
          stateRef = input.state;
        else if (typeof input.state === "string" && input.state.trim())
          stateRef = input.state;
        else return "state must be an integer id or a non-empty name string.";
      }
      return { stateRef };
    },
    applyFilters: (items, filters) => {
      let stateId: number | null = null;
      if (filters.stateRef !== null) {
        stateId = runtime.resolveStateRef(filters.stateRef);
        if (stateId === null)
          return `Could not resolve state ${JSON.stringify(filters.stateRef)}.`;
      }
      const filtered =
        stateId !== null ? items.filter((p) => p.stateId === stateId) : items;
      return {
        items: filtered,
        echo: { filters: { state: stateId } },
      };
    },
  });
}

export const listProvincesTool = createListProvincesTool();
