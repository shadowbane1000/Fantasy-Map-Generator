import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

const MIN_HABITABILITY = 0;
const MAX_HABITABILITY = 9999;

export interface BiomeHabitabilityRef {
  i: number;
  name: string;
  previousHabitability: number;
}

export interface BiomeHabitabilityRuntime {
  find(ref: number | string): BiomeHabitabilityRef | null;
  apply(id: number, value: number): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  habitability?: number[];
}

export const defaultBiomeHabitabilityRuntime: BiomeHabitabilityRuntime = {
  find(ref) {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return null;
    const prev = biomesData?.habitability?.[res.k];
    return {
      i: res.id,
      name: res.name,
      previousHabitability: typeof prev === "number" ? prev : 0,
    };
  },
  apply(id: number, value: number): void {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, id);
    if (!res || !Array.isArray(biomesData?.habitability)) {
      throw new Error(`Biome ${id} not found.`);
    }
    biomesData.habitability[res.k] = value;
    const recalculate = getGlobal<() => void>("recalculatePopulation");
    if (typeof recalculate === "function") {
      try {
        recalculate();
      } catch {
        // Best-effort: the data mutation already happened.
      }
    }
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createSetBiomeHabitabilityTool(
  runtime: BiomeHabitabilityRuntime = defaultBiomeHabitabilityRuntime,
): Tool {
  return {
    name: "set_biome_habitability",
    description: `Set a biome's habitability — writes biomesData.habitability[k] and calls recalculatePopulation() (same side-effect as the Biomes Editor habitability input). Habitability is a density multiplier applied to each biome's cells; 0 = uninhabitable (like Marine or Glacier by default). Integer in [${MIN_HABITABILITY}, ${MAX_HABITABILITY}]. Matches by numeric id (0 = Marine) or case-insensitive current name; biomes whose name slot is 'removed' are skipped.`,
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine) or case-insensitive current biome name.",
        },
        habitability: {
          type: "integer",
          minimum: MIN_HABITABILITY,
          maximum: MAX_HABITABILITY,
          description: `Integer in [${MIN_HABITABILITY}, ${MAX_HABITABILITY}].`,
        },
      },
      required: ["biome", "habitability"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        biome?: unknown;
        habitability?: unknown;
      };

      if (!isValidRef(input.biome)) {
        return errorResult(
          "biome must be a non-negative integer id or a non-empty name string.",
        );
      }
      const h = input.habitability;
      if (
        typeof h !== "number" ||
        !Number.isInteger(h) ||
        h < MIN_HABITABILITY ||
        h > MAX_HABITABILITY
      ) {
        return errorResult(
          `habitability must be an integer in [${MIN_HABITABILITY}, ${MAX_HABITABILITY}].`,
        );
      }

      const ref = input.biome as number | string;
      const current = runtime.find(ref);
      if (!current) {
        return errorResult(`No biome found matching ${JSON.stringify(ref)}.`);
      }

      try {
        runtime.apply(current.i, h);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousHabitability: current.previousHabitability,
        habitability: h,
      });
    },
  };
}

export const setBiomeHabitabilityTool = createSetBiomeHabitabilityTool();
