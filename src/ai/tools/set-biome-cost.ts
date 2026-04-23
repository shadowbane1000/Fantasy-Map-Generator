import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

const MIN_COST = 0;
const MAX_COST = 100000;

export interface BiomeCostRef {
  i: number;
  name: string;
  previousCost: number;
}

export interface BiomeCostRuntime {
  find(ref: number | string): BiomeCostRef | null;
  apply(id: number, value: number): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  cost?: number[];
}

export const defaultBiomeCostRuntime: BiomeCostRuntime = {
  find(ref) {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return null;
    const prev = biomesData?.cost?.[res.k];
    return {
      i: res.id,
      name: res.name,
      previousCost: typeof prev === "number" ? prev : 0,
    };
  },
  apply(id: number, value: number): void {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, id);
    if (!res || !Array.isArray(biomesData?.cost)) {
      throw new Error(`Biome ${id} not found.`);
    }
    biomesData.cost[res.k] = value;
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createSetBiomeCostTool(
  runtime: BiomeCostRuntime = defaultBiomeCostRuntime,
): Tool {
  return {
    name: "set_biome_cost",
    description: `Set a biome's traversal cost — writes biomesData.cost[k]. This is the "movement cost" penalty consulted by the states / cultures / religions expansion generators when they spread into a non-native biome (higher = harder to expand through; Glacier defaults to 5000, Grassland to 50). The Biomes Editor does not expose this field — it is data-only — so there is no DOM/SVG update. The change is NOT retroactive: existing state / culture / religion territories are unaffected; the new cost only matters for the next regeneration. Integer in [${MIN_COST}, ${MAX_COST}]. Matches by numeric id (0 = Marine) or case-insensitive current name; biomes whose name slot is 'removed' are skipped.`,
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine) or case-insensitive current biome name.",
        },
        cost: {
          type: "integer",
          minimum: MIN_COST,
          maximum: MAX_COST,
          description: `Integer in [${MIN_COST}, ${MAX_COST}]. Default biome costs range from 10 (Marine) to 5000 (Glacier).`,
        },
      },
      required: ["biome", "cost"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        biome?: unknown;
        cost?: unknown;
      };

      if (!isValidRef(input.biome)) {
        return errorResult(
          "biome must be a non-negative integer id or a non-empty name string.",
        );
      }
      const c = input.cost;
      if (
        typeof c !== "number" ||
        !Number.isInteger(c) ||
        c < MIN_COST ||
        c > MAX_COST
      ) {
        return errorResult(
          `cost must be an integer in [${MIN_COST}, ${MAX_COST}].`,
        );
      }

      const ref = input.biome as number | string;
      const current = runtime.find(ref);
      if (!current) {
        return errorResult(`No biome found matching ${JSON.stringify(ref)}.`);
      }

      try {
        runtime.apply(current.i, c);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousCost: current.previousCost,
        cost: c,
      });
    },
  };
}

export const setBiomeCostTool = createSetBiomeCostTool();
