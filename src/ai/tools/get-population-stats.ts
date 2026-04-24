import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_TOP_N = 10;
export const MAX_TOP_N = 500;

export interface TopEntry {
  i: number;
  name: string;
  population: number;
}

export interface PopulationStats {
  population_total: number;
  urban_population: number;
  rural_population: number;
  top_states: TopEntry[];
  top_burgs: TopEntry[];
  population_rate: number;
  urbanization: number;
}

export interface PopulationRates {
  populationRate: number;
  urbanization: number;
}

export interface PopulationStatsPackLike {
  states?: RawState[];
  burgs?: RawBurg[];
  cells?: {
    pop?: ArrayLike<number> | number[];
  };
}

function safeMultiplier(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function sumCellsPop(arr: ArrayLike<number> | number[] | undefined): number {
  if (!arr) return 0;
  let total = 0;
  const len = arr.length;
  const a = arr as ArrayLike<number>;
  for (let i = 0; i < len; i++) {
    const v = a[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

export function readPopulationStatsFromPack(
  pack: PopulationStatsPackLike | undefined,
  rates: PopulationRates,
  topN: number,
): PopulationStats | "not-ready" {
  if (!pack || !pack.cells || !pack.burgs || !pack.states) return "not-ready";

  const rate = safeMultiplier(rates.populationRate);
  const urban = safeMultiplier(rates.urbanization);
  const n = Math.max(0, Math.floor(topN));

  // Rural: sum cells.pop.
  const ruralRaw = sumCellsPop(pack.cells.pop);

  // Urban + burg top candidates.
  let urbanRaw = 0;
  const burgCandidates: TopEntry[] = [];
  for (const b of pack.burgs) {
    if (!b || b.removed) continue;
    if (b.i === 0) continue;
    const raw = typeof b.population === "number" ? b.population : 0;
    if (Number.isFinite(raw) && raw > 0) urbanRaw += raw;
    burgCandidates.push({
      i: b.i,
      name: b.name ?? "",
      population: Math.max(0, Math.round(raw * rate * urban)),
    });
  }

  // State top candidates — use pre-aggregated state.rural / state.urban.
  const stateCandidates: TopEntry[] = [];
  for (const s of pack.states) {
    if (!s || s.removed) continue;
    if (s.i === 0) continue;
    const sRural = typeof s.rural === "number" ? s.rural : 0;
    const sUrban = typeof s.urban === "number" ? s.urban : 0;
    stateCandidates.push({
      i: s.i,
      name: s.name ?? "",
      population: Math.max(0, Math.round((sRural + sUrban) * rate)),
    });
  }

  burgCandidates.sort((a, b) => b.population - a.population);
  stateCandidates.sort((a, b) => b.population - a.population);

  const rural = Math.max(0, Math.round(ruralRaw * rate));
  const urbanTotal = Math.max(0, Math.round(urbanRaw * rate * urban));
  const total = Math.max(
    0,
    Math.round(ruralRaw * rate + urbanRaw * rate * urban),
  );

  return {
    population_total: total,
    urban_population: urbanTotal,
    rural_population: rural,
    top_states: stateCandidates.slice(0, n),
    top_burgs: burgCandidates.slice(0, n),
    population_rate: rate,
    urbanization: urban,
  };
}

export interface PopulationStatsRuntime {
  readStats(topN: number): PopulationStats | "not-ready";
}

export const defaultPopulationStatsRuntime: PopulationStatsRuntime = {
  readStats(topN: number): PopulationStats | "not-ready" {
    const pack = getPack<PopulationStatsPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    const urbanization = getGlobal<number>("urbanization");
    return readPopulationStatsFromPack(
      pack,
      {
        populationRate: typeof populationRate === "number" ? populationRate : 1,
        urbanization: typeof urbanization === "number" ? urbanization : 1,
      },
      topN,
    );
  },
};

function parseTopN(value: unknown): number | string {
  if (value === undefined || value === null) return DEFAULT_TOP_N;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "top_n must be an integer.";
  }
  if (value < 0) return "top_n must be >= 0.";
  if (value > MAX_TOP_N) return `top_n must be <= ${MAX_TOP_N}.`;
  return value;
}

export function createGetPopulationStatsTool(
  runtime: PopulationStatsRuntime = defaultPopulationStatsRuntime,
): Tool {
  return {
    name: "get_population_stats",
    description:
      'Read aggregate population statistics for the whole generated world — the demographic summary parallel of get_map_info. Sums rural population as `pack.cells.pop[k] × populationRate` over every cell (typed-array scan) and urban population as `burg.population × populationRate × urbanization` over every non-removed burg (skipping the index-0 placeholder), exactly matching the scaling list_burgs / list_states / get_state_info / get_province_info use for display. Also surfaces the top N most populous states (from pre-aggregated `state.rural + state.urban`, skipping id 0 Neutrals and removed states) and top N most populous burgs (sorted desc by computed population, skipping id 0 and removed). Optional `top_n` (integer in [0, 500], default 10) — `0` returns empty top lists. Returns `{ ok, population_total, urban_population, rural_population, top_states, top_burgs, population_rate, urbanization }` with integer-rounded populations. Read-only — never mutates the pack. Useful for demographic audits ("how big is the world?", "which are the biggest cities / states?"), choosing expansion targets, or sanity-checking `set_world_rates` changes. Errors only on un-generated map (pack / cells / burgs / states missing) or out-of-range `top_n`. Requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {
        top_n: {
          type: "integer",
          minimum: 0,
          maximum: MAX_TOP_N,
          description: `How many top states / top burgs to include (default ${DEFAULT_TOP_N}, max ${MAX_TOP_N}, 0 returns empty lists).`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { top_n?: unknown };
      const parsed = parseTopN(input.top_n);
      if (typeof parsed === "string") return errorResult(parsed);
      const stats = runtime.readStats(parsed);
      if (stats === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...stats });
    },
  };
}

export const getPopulationStatsTool = createGetPopulationStatsTool();
