import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

export const DEFAULT_BIOME_COUNT = 13;

export interface RemoveBiomeRef {
  i: number;
  name: string;
}

export interface BiomeRemovalRuntime {
  find(ref: number | string): RemoveBiomeRef | null;
  remove(id: number): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
}

export const defaultBiomeRemovalRuntime: BiomeRemovalRuntime = {
  find(ref) {
    const res = findBiomeByRef(getGlobal<BiomesDataLike>("biomesData"), ref);
    if (!res) return null;
    return { i: res.id, name: res.name };
  },
  remove(id: number): void {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, id);
    if (!res || !biomesData?.name) {
      throw new Error(`Biome ${id} not found.`);
    }
    if (id < DEFAULT_BIOME_COUNT) {
      throw new Error(
        `Cannot remove default biome ${id}; only custom biomes (id >= ${DEFAULT_BIOME_COUNT}) can be removed.`,
      );
    }
    biomesData.name[res.k] = "removed";
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createRemoveBiomeTool(
  runtime: BiomeRemovalRuntime = defaultBiomeRemovalRuntime,
): Tool {
  return {
    name: "remove_biome",
    description: `Remove a custom biome by setting biomesData.name[k] to the 'removed' sentinel — same side-effect as the Biomes Editor trash icon. Only custom biomes (id >= ${DEFAULT_BIOME_COUNT}) can be removed; default biomes (ids 0..${DEFAULT_BIOME_COUNT - 1}) are protected because cells may still reference them. Matches by numeric id or case-insensitive current name; already-removed slots don't resolve.`,
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id or case-insensitive current name. Must resolve to a custom biome (id >= 13).",
        },
      },
      required: ["biome"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { biome?: unknown };
      if (!isValidRef(input.biome)) {
        return errorResult(
          "biome must be a non-negative integer id or a non-empty name string.",
        );
      }

      const ref = input.biome as number | string;
      const current = runtime.find(ref);
      if (!current) {
        return errorResult(`No biome found matching ${JSON.stringify(ref)}.`);
      }

      if (current.i < DEFAULT_BIOME_COUNT) {
        return errorResult(
          `Cannot remove default biome ${current.i} (${JSON.stringify(current.name)}); only custom biomes (id >= ${DEFAULT_BIOME_COUNT}) can be removed.`,
        );
      }

      try {
        runtime.remove(current.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ i: current.i, name: current.name });
    },
  };
}

export const removeBiomeTool = createRemoveBiomeTool();
