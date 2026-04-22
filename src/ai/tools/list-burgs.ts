import {
  createPaginatedListTool,
  getGlobal,
  getPack,
  isActive,
  type RawBurg,
  type RawCulture,
  type RawState,
} from "./_shared";
import type { Tool } from "./index";

export interface BurgSummary {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  state: string | null;
  stateId: number;
  culture: string | null;
  cultureId: number;
  capital: boolean;
  port: boolean;
  type: string | null;
}

export interface BurgPackLike {
  burgs?: RawBurg[];
  states?: RawState[];
  cultures?: RawCulture[];
}

export interface PopulationRates {
  populationRate: number;
  urbanization: number;
}

function safeMultiplier(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function readBurgsFromPack(
  pack: BurgPackLike | undefined,
  rates: PopulationRates,
): BurgSummary[] | null {
  if (!pack?.burgs) return null;
  const states = pack.states ?? [];
  const cultures = pack.cultures ?? [];
  const rate = safeMultiplier(rates.populationRate);
  const urban = safeMultiplier(rates.urbanization);
  const usingFallback = !(
    Number.isFinite(rates.populationRate) &&
    rates.populationRate > 0 &&
    Number.isFinite(rates.urbanization) &&
    rates.urbanization > 0
  );

  return pack.burgs.filter(isActive).map((b): BurgSummary => {
    const rawPop = typeof b.population === "number" ? b.population : 0;
    const scaled = usingFallback ? rawPop : rawPop * rate * urban;
    const stateId = typeof b.state === "number" ? b.state : 0;
    const cultureId = typeof b.culture === "number" ? b.culture : 0;
    return {
      i: b.i,
      name: b.name ?? "",
      x: typeof b.x === "number" ? b.x : 0,
      y: typeof b.y === "number" ? b.y : 0,
      population: Math.max(0, Math.round(scaled)),
      stateId,
      state: states[stateId]?.name ?? null,
      cultureId,
      culture: cultures[cultureId]?.name ?? null,
      capital: !!b.capital,
      port: !!b.port,
      type: b.type ?? null,
    };
  });
}

export function resolveStateRefInPack(
  pack: BurgPackLike | undefined,
  ref: number | string,
): number | null {
  const states = pack?.states;
  if (!states) return null;
  if (typeof ref === "number") {
    const s = states[ref];
    if (!s || s.removed) return null;
    return s.i;
  }
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const s of states) {
    if (!s || s.removed) continue;
    if (
      (s.name ?? "").toLowerCase() === needle ||
      (s.fullName ?? "").toLowerCase() === needle
    )
      return s.i;
  }
  return null;
}

export interface BurgsRuntime {
  readBurgs(): BurgSummary[] | null;
  resolveStateRef(ref: number | string): number | null;
}

export const defaultBurgsRuntime: BurgsRuntime = {
  readBurgs(): BurgSummary[] | null {
    const populationRate = getGlobal<number>("populationRate");
    const urbanization = getGlobal<number>("urbanization");
    return readBurgsFromPack(getPack<BurgPackLike>(), {
      populationRate: typeof populationRate === "number" ? populationRate : 1,
      urbanization: typeof urbanization === "number" ? urbanization : 1,
    });
  },
  resolveStateRef(ref) {
    return resolveStateRefInPack(getPack<BurgPackLike>(), ref);
  },
};

interface BurgFilters {
  stateRef: number | string | null;
  capitalOnly: boolean;
  portOnly: boolean;
}

export function createListBurgsTool(
  runtime: BurgsRuntime = defaultBurgsRuntime,
): Tool {
  return createPaginatedListTool<BurgSummary, BurgFilters>({
    name: "list_burgs",
    description:
      "List burgs (cities and towns) on the current map. Each burg reports its id, name, coordinates, population, state/culture names, capital/port flags, and type. Skips the index-0 placeholder and removed burgs. Supports pagination and filtering by state (id or name), capital_only, and port_only.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of burgs to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of burgs to skip (default 0).",
        },
        state: {
          type: ["integer", "string"],
          description:
            "Optional state filter. Numeric id or case-insensitive state name / fullName.",
        },
        capital_only: {
          type: "boolean",
          description: "If true, only include capital burgs (default false).",
        },
        port_only: {
          type: "boolean",
          description: "If true, only include port burgs (default false).",
        },
      },
    },
    collectionKey: "burgs",
    notReadyError:
      "Map is not ready yet; cannot list burgs. Wait for the 'map:generated' event on window.",
    read: () => runtime.readBurgs(),
    parseFilters: (input) => {
      let stateRef: number | string | null = null;
      let capitalOnly = false;
      let portOnly = false;
      if (input.state !== undefined && input.state !== null) {
        if (typeof input.state === "number" && Number.isInteger(input.state))
          stateRef = input.state;
        else if (typeof input.state === "string" && input.state.trim())
          stateRef = input.state;
        else return "state must be an integer id or a non-empty name string.";
      }
      if (input.capital_only !== undefined && input.capital_only !== null) {
        if (typeof input.capital_only !== "boolean")
          return "capital_only must be a boolean.";
        capitalOnly = input.capital_only;
      }
      if (input.port_only !== undefined && input.port_only !== null) {
        if (typeof input.port_only !== "boolean")
          return "port_only must be a boolean.";
        portOnly = input.port_only;
      }
      return { stateRef, capitalOnly, portOnly };
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
        filtered = filtered.filter((b) => b.stateId === stateId);
      if (filters.capitalOnly) filtered = filtered.filter((b) => b.capital);
      if (filters.portOnly) filtered = filtered.filter((b) => b.port);
      return {
        items: filtered,
        echo: {
          filters: {
            state: stateId,
            capital_only: filters.capitalOnly,
            port_only: filters.portOnly,
          },
        },
      };
    },
  });
}

export const listBurgsTool = createListBurgsTool();
