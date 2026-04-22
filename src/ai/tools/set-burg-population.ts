import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface BurgPopulationRef {
  i: number;
  name: string;
  displayPopulation: number;
}

export interface PopulationRates {
  populationRate: number;
  urbanization: number;
}

export interface BurgPopulationRuntime {
  find(ref: number | string): BurgPopulationRef | null;
  setDisplayPopulation(i: number, displayPopulation: number): void;
}

function safeRate(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function scaleDisplayToInternal(
  display: number,
  rates: PopulationRates,
): number {
  const pop = safeRate(rates.populationRate);
  const urban = safeRate(rates.urbanization);
  const internal = display / pop / urban;
  return Math.round(internal * 10000) / 10000;
}

export function scaleInternalToDisplay(
  internal: number,
  rates: PopulationRates,
): number {
  const pop = safeRate(rates.populationRate);
  const urban = safeRate(rates.urbanization);
  return Math.max(0, Math.round(internal * pop * urban));
}

function currentRates(): PopulationRates {
  const populationRate = getGlobal<number>("populationRate");
  const urbanization = getGlobal<number>("urbanization");
  return {
    populationRate: typeof populationRate === "number" ? populationRate : 1,
    urbanization: typeof urbanization === "number" ? urbanization : 1,
  };
}

export const defaultBurgPopulationRuntime: BurgPopulationRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    const raw = typeof entry.population === "number" ? entry.population : 0;
    return {
      i: entry.i,
      name: entry.name ?? "",
      displayPopulation: scaleInternalToDisplay(raw, currentRates()),
    };
  },
  setDisplayPopulation(i: number, displayPopulation: number): void {
    const burgs = getPackCollection<RawBurg>("burgs");
    const b = burgs?.[i];
    if (!b) throw new Error(`Burg ${i} not found.`);
    if (b.removed) throw new Error(`Burg ${i} has been removed.`);
    b.population = scaleDisplayToInternal(displayPopulation, currentRates());
  },
};

export function createSetBurgPopulationTool(
  runtime: BurgPopulationRuntime = defaultBurgPopulationRuntime,
): Tool {
  return {
    name: "set_burg_population",
    description:
      "Set the population of a specific burg. The value is the *displayed* population (people living there) — same scale the Burg Editor input uses. Internally divided by window.populationRate and window.urbanization before storage, matching what the Burg Editor does. Refs may be a numeric id (from list_burgs) or a case-insensitive current name.",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description:
            "Numeric burg id (> 0) or the burg's current case-insensitive name.",
        },
        population: {
          type: "number",
          minimum: 0,
          description:
            "New displayed population (e.g. 50000). Must be a non-negative finite number. 0 is allowed (abandoned settlement).",
        },
      },
      required: ["burg", "population"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        population?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);
      if (
        typeof input.population !== "number" ||
        !Number.isFinite(input.population) ||
        input.population < 0
      ) {
        return errorResult("population must be a non-negative finite number.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set population on burg 0 (the placeholder entry).",
        );
      }

      try {
        runtime.setDisplayPopulation(current.i, input.population);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousPopulation: current.displayPopulation,
        population: input.population,
      });
    },
  };
}

export const setBurgPopulationTool = createSetBurgPopulationTool();
