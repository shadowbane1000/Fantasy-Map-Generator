import {
  createPaginatedListTool,
  getPack,
  isActive,
  type RawState,
} from "./_shared";
import type { Tool } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";

export interface RegimentSummary {
  i: number;
  name: string;
  stateId: number;
  state: string | null;
  type: string | null;
  total: number;
  army: number;
  cell: number;
  x: number;
  y: number;
  naval: boolean;
  units: Record<string, number>;
}

export interface RegimentPackLike {
  states?: RawState[];
}

function toInt(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function readRegimentsFromPack(
  pack: RegimentPackLike | undefined,
): RegimentSummary[] | null {
  if (!pack?.states) return null;
  const out: RegimentSummary[] = [];
  for (const state of pack.states) {
    if (!isActive(state)) continue;
    const military = state.military;
    if (!Array.isArray(military) || military.length === 0) continue;
    for (const r of military) {
      if (!r || typeof r.i !== "number") continue;
      out.push({
        i: r.i,
        name: r.name ?? "",
        stateId: state.i,
        state: state.name ?? null,
        type: r.type ?? null,
        total: toInt(r.t),
        army: toInt(r.a),
        cell: toInt(r.cell),
        x: toInt(r.x),
        y: toInt(r.y),
        naval: r.n === 1,
        units: r.u ?? {},
      });
    }
  }
  return out;
}

export interface RegimentsRuntime {
  readRegiments(): RegimentSummary[] | null;
  resolveStateRef(ref: number | string): number | null;
}

export const defaultRegimentsRuntime: RegimentsRuntime = {
  readRegiments(): RegimentSummary[] | null {
    return readRegimentsFromPack(getPack<BurgPackLike>());
  },
  resolveStateRef(ref) {
    return resolveStateRefInPack(getPack<BurgPackLike>(), ref);
  },
};

interface RegimentFilters {
  stateRef: number | string | null;
  typeFilter: string | null;
  navalOnly: boolean;
  minTotal: number | null;
}

export function createListRegimentsTool(
  runtime: RegimentsRuntime = defaultRegimentsRuntime,
): Tool {
  return createPaginatedListTool<RegimentSummary, RegimentFilters>({
    name: "list_regiments",
    description:
      "List military regiments across all states (the same data the Military Overview reads from pack.states[*].military). Each entry reports id, name, state, type, total troops, army, coords, cell, naval flag, and the unit composition map. Paginated. Optional filters: state (id or case-insensitive name/fullName), type (case-insensitive exact match), naval_only (fleets only), min_total (minimum troop count).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of regiments to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of regiments to skip (default 0).",
        },
        state: {
          type: ["integer", "string"],
          description:
            "Optional state filter. Numeric id or case-insensitive state name / fullName.",
        },
        type: {
          type: "string",
          description:
            "Optional regiment type filter (e.g. 'Army', 'Fleet'). Case-insensitive exact match.",
        },
        naval_only: {
          type: "boolean",
          description: "If true, only fleets (naval regiments) are returned.",
        },
        min_total: {
          type: "number",
          minimum: 0,
          description: "Optional minimum total troop count.",
        },
      },
    },
    collectionKey: "regiments",
    notReadyError:
      "Map is not ready yet; cannot list regiments. Wait for the 'map:generated' event on window.",
    read: () => runtime.readRegiments(),
    parseFilters: (input) => {
      let stateRef: number | string | null = null;
      let typeFilter: string | null = null;
      let navalOnly = false;
      let minTotal: number | null = null;
      if (input.state !== undefined && input.state !== null) {
        if (typeof input.state === "number" && Number.isInteger(input.state))
          stateRef = input.state;
        else if (typeof input.state === "string" && input.state.trim())
          stateRef = input.state;
        else return "state must be an integer id or a non-empty name string.";
      }
      if (input.type !== undefined && input.type !== null) {
        if (typeof input.type !== "string" || !input.type.trim())
          return "type must be a non-empty string.";
        typeFilter = input.type.trim().toLowerCase();
      }
      if (input.naval_only !== undefined && input.naval_only !== null) {
        if (typeof input.naval_only !== "boolean")
          return "naval_only must be a boolean.";
        navalOnly = input.naval_only;
      }
      if (input.min_total !== undefined && input.min_total !== null) {
        if (
          typeof input.min_total !== "number" ||
          !Number.isFinite(input.min_total) ||
          input.min_total < 0
        )
          return "min_total must be a non-negative finite number.";
        minTotal = input.min_total;
      }
      return { stateRef, typeFilter, navalOnly, minTotal };
    },
    applyFilters: (items, filters) => {
      let stateId: number | null = null;
      if (filters.stateRef !== null) {
        stateId = runtime.resolveStateRef(filters.stateRef);
        if (stateId === null)
          return `Could not resolve state ${JSON.stringify(filters.stateRef)}.`;
      }
      let filtered = items;
      if (stateId !== null)
        filtered = filtered.filter((r) => r.stateId === stateId);
      if (filters.typeFilter !== null) {
        filtered = filtered.filter(
          (r) => (r.type ?? "").toLowerCase() === filters.typeFilter,
        );
      }
      if (filters.navalOnly) filtered = filtered.filter((r) => r.naval);
      if (filters.minTotal !== null) {
        const min = filters.minTotal;
        filtered = filtered.filter((r) => r.total >= min);
      }
      return {
        items: filtered,
        echo: {
          filters: {
            state: stateId,
            type: filters.typeFilter,
            naval_only: filters.navalOnly,
            min_total: filters.minTotal,
          },
        },
      };
    },
  });
}

export const listRegimentsTool = createListRegimentsTool();
