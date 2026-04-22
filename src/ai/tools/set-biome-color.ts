import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";
import { isValidCssColor } from "./set-state-color";

export interface BiomeColorRef {
  i: number;
  name: string;
  previousColor: string | null;
}

export interface BiomeColorRuntime {
  find(ref: number | string): BiomeColorRef | null;
  applyColor(id: number, color: string): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  color?: string[];
}

export const defaultBiomeColorRuntime: BiomeColorRuntime = {
  find(ref) {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return null;
    return {
      i: res.id,
      name: res.name,
      previousColor: biomesData?.color?.[res.k] ?? null,
    };
  },
  applyColor(id: number, color: string): void {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, id);
    if (!res || !biomesData?.color) {
      throw new Error(`Biome ${id} not found.`);
    }
    biomesData.color[res.k] = color;
    if (typeof document !== "undefined") {
      const el = document.getElementById(`biome${id}`);
      if (el) {
        el.setAttribute("fill", color);
        el.setAttribute("stroke", color);
      }
    }
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createSetBiomeColorTool(
  runtime: BiomeColorRuntime = defaultBiomeColorRuntime,
): Tool {
  return {
    name: "set_biome_color",
    description:
      "Recolor a biome (writes biomesData.color[k] and refreshes the #biome{i} SVG element's fill + stroke attributes — same side-effect as the Biomes Editor swatch). Matches by numeric id (0 = Marine) or case-insensitive current name. Accepts hex, rgb()/rgba()/hsl()/hsla(), or named CSS colors. Biomes whose name slot is the sentinel 'removed' are skipped.",
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine) or case-insensitive current biome name.",
        },
        color: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or a named color).",
        },
      },
      required: ["biome", "color"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        biome?: unknown;
        color?: unknown;
      };

      if (!isValidRef(input.biome)) {
        return errorResult(
          "biome must be a non-negative integer id or a non-empty name string.",
        );
      }
      if (!isValidCssColor(input.color)) {
        return errorResult(
          "color must be a valid CSS color (#hex, rgb(), rgba(), hsl(), hsla(), or a named color).",
        );
      }

      const color = input.color.trim();
      const ref = input.biome as number | string;
      const current = runtime.find(ref);
      if (!current) {
        return errorResult(`No biome found matching ${JSON.stringify(ref)}.`);
      }

      try {
        runtime.applyColor(current.i, color);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousColor: current.previousColor,
        color,
      });
    },
  };
}

export const setBiomeColorTool = createSetBiomeColorTool();
