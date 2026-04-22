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

export interface StateSummary {
  i: number;
  name: string;
  fullName: string | null;
  form: string | null;
  type: string | null;
  color: string | null;
  culture: string | null;
  capital: string | null;
  burgs: number;
  cells: number;
  area: number;
  population: number;
}

export interface StatesRuntime {
  readStates(): StateSummary[] | null;
}

interface PackLike {
  states?: RawState[];
  cultures?: RawCulture[];
  burgs?: RawBurg[];
}

function summarize(
  state: RawState,
  pack: PackLike,
  populationRate: number,
): StateSummary {
  const cultures = pack.cultures ?? [];
  const burgs = pack.burgs ?? [];
  const cultureName =
    typeof state.culture === "number" ? cultures[state.culture]?.name : null;
  const capitalName =
    typeof state.capital === "number" && state.capital > 0
      ? burgs[state.capital]?.name
      : null;
  const rural = state.rural ?? 0;
  const urban = state.urban ?? 0;
  const rawPop = rural + urban;
  const rate =
    Number.isFinite(populationRate) && populationRate > 0 ? populationRate : 1;
  return {
    i: state.i,
    name: state.name ?? "",
    fullName: state.fullName ?? null,
    form: state.form ?? null,
    type: state.type ?? null,
    color: state.color ?? null,
    culture: cultureName ?? null,
    capital: capitalName ?? null,
    burgs: state.burgs ?? 0,
    cells: state.cells ?? 0,
    area: state.area ?? 0,
    population: Math.round(rawPop * rate),
  };
}

export function readStatesFromPack(
  pack: PackLike | undefined,
  populationRate: number,
): StateSummary[] | null {
  if (!pack?.states) return null;
  return pack.states
    .filter(isActive)
    .map((s) => summarize(s, pack, populationRate));
}

export const defaultStatesRuntime: StatesRuntime = {
  readStates(): StateSummary[] | null {
    const populationRate = getGlobal<number>("populationRate");
    const rate = typeof populationRate === "number" ? populationRate : 1;
    return readStatesFromPack(getPack<PackLike>(), rate);
  },
};

export function createListStatesTool(
  runtime: StatesRuntime = defaultStatesRuntime,
): Tool {
  return createPaginatedListTool<StateSummary>({
    name: "list_states",
    description:
      "List the states on the current map with their names, forms, capitals, cultures, colors, and populations. Skips the 'Neutrals' placeholder at id 0 and any removed states. Supports pagination via limit (1-500, default 100) and offset (>=0, default 0).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of states to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of states to skip (default 0).",
        },
      },
    },
    collectionKey: "states",
    notReadyError:
      "Map is not ready yet; cannot list states. Wait for the 'map:generated' event on window.",
    read: () => runtime.readStates(),
  });
}

export const listStatesTool = createListStatesTool();
