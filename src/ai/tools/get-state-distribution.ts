import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface StateDistributionEntry {
  i: number;
  name: string;
  fullName: string | null;
  form: string | null;
  color: string | null;
  capital: string | null;
  cells_count: number;
  percentage: number;
  area: number;
  population: number;
}

export interface StateDistribution {
  total_cells: number;
  total_population: number;
  states: StateDistributionEntry[];
}

export interface StateDistributionPackLike {
  states?: RawState[];
  burgs?: RawBurg[];
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeMultiplier(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Pure aggregator: given the world state (`pack`) and the display
 * `populationRate`, compute the distribution of states — one entry per
 * active (non-placeholder, non-removed) state — sorted by `cells_count`
 * descending. Population scales raw `rural + urban` by `populationRate`
 * (with the same `rate <= 0 / NaN -> 1` fallback `list_states` uses).
 * Percentage is `cells_count / total_cells * 100` (0 when `total_cells`
 * is 0). Capital name is resolved from `pack.burgs[state.capital].name`
 * (null when the state has no capital or the burg is missing). Returns
 * `"not-ready"` when `pack` / `pack.states` is missing.
 */
export function readStateDistributionFromPack(
  pack: StateDistributionPackLike | undefined,
  populationRate: number,
): StateDistribution | "not-ready" {
  if (!pack?.states) return "not-ready";

  const rate = safeMultiplier(populationRate);
  const burgs = pack.burgs ?? [];

  interface WorkingEntry {
    i: number;
    name: string;
    fullName: string | null;
    form: string | null;
    color: string | null;
    capital: string | null;
    cells_count: number;
    area: number;
    population: number;
  }

  const working: WorkingEntry[] = [];
  let totalCells = 0;
  let totalPopulation = 0;

  for (const state of pack.states) {
    if (!state) continue;
    if (state.i === 0) continue;
    if (state.removed) continue;

    const cells = numeric(state.cells);
    const area = numeric(state.area);
    const rawPop = numeric(state.rural) + numeric(state.urban);
    const population = Math.max(0, Math.round(rawPop * rate));

    const capitalName =
      typeof state.capital === "number" && state.capital > 0
        ? typeof burgs[state.capital]?.name === "string"
          ? (burgs[state.capital]?.name ?? null)
          : null
        : null;

    working.push({
      i: state.i,
      name: typeof state.name === "string" ? state.name : "",
      fullName: typeof state.fullName === "string" ? state.fullName : null,
      form: typeof state.form === "string" ? state.form : null,
      color: typeof state.color === "string" ? state.color : null,
      capital: capitalName,
      cells_count: cells,
      area,
      population,
    });

    totalCells += cells;
    totalPopulation += population;
  }

  working.sort((a, b) => b.cells_count - a.cells_count);

  const states: StateDistributionEntry[] = working.map((entry) => ({
    i: entry.i,
    name: entry.name,
    fullName: entry.fullName,
    form: entry.form,
    color: entry.color,
    capital: entry.capital,
    cells_count: entry.cells_count,
    percentage: totalCells > 0 ? (entry.cells_count / totalCells) * 100 : 0,
    area: entry.area,
    population: entry.population,
  }));

  return {
    total_cells: totalCells,
    total_population: totalPopulation,
    states,
  };
}

export interface StateDistributionRuntime {
  readDistribution(): StateDistribution | "not-ready";
}

export const defaultStateDistributionRuntime: StateDistributionRuntime = {
  readDistribution(): StateDistribution | "not-ready" {
    const pack = getPack<StateDistributionPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    return readStateDistributionFromPack(
      pack,
      typeof populationRate === "number" ? populationRate : 1,
    );
  },
};

export function createGetStateDistributionTool(
  runtime: StateDistributionRuntime = defaultStateDistributionRuntime,
): Tool {
  return {
    name: "get_state_distribution",
    description:
      "Read the aggregate distribution of states across the current map — the state-level parallel of `get_religion_distribution` / `get_culture_distribution` and a companion to `list_states` / `find_largest_states`. Iterates `pack.states` linearly, skipping the index-0 'Neutrals' placeholder and any `removed: true` entries, and uses the pre-aggregated per-state fields (`state.cells`, `state.area`, `state.rural + state.urban`) — no per-cell scan, so it stays O(states). Population is computed as `Math.round((rural + urban) × populationRate)` with the same `rate <= 0 / NaN → 1` fallback `list_states` uses (but NOT multiplied by `urbanization`, since a state's rural + urban is already the combined raw total). Capital name is resolved via `pack.burgs[state.capital].name` (falls back to `null` when `state.capital` is 0 or the burg is missing) — matches `list_states` / `find_largest_states`. `percentage` is each state's share of `total_cells` — `cells_count / total_cells × 100`, floating, 0 when `total_cells` is 0. Returns `{ ok, total_cells, total_population, states }` sorted by `cells_count` descending. Each state is `{ i, name, fullName, form, color, capital, cells_count, percentage, area, population }`; `fullName` / `form` / `color` / `capital` fall back to `null` when the raw state omits them. `total_cells` is the sum of `state.cells` over active states (NOT the total map cell count — cells without an assigned state sit on Neutrals id 0 and are excluded). `total_population` is the sum of the per-state scaled populations. Accepts no parameters. When the map has no active states, `states` is `[]`, `total_cells` and `total_population` are `0`, still `ok: true`. Useful for audits (how is territory distributed across polities?), demographic summaries that need per-state population counts, and deciding which states to rename / recolor / merge. Read-only — never mutates the pack. Errors only on un-generated map (pack or `pack.states` missing). Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const result = runtime.readDistribution();
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getStateDistributionTool = createGetStateDistributionTool();
