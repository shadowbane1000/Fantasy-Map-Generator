import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

const MIN_DENSITY = 0;
const MAX_DENSITY = 1000;

export interface BiomeIconsDensityRef {
  i: number;
  name: string;
  previousDensity: number;
}

export interface BiomeIconsDensityRuntime {
  find(ref: number | string): BiomeIconsDensityRef | null;
  apply(id: number, value: number): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  iconsDensity?: number[];
}

export const defaultBiomeIconsDensityRuntime: BiomeIconsDensityRuntime = {
  find(ref) {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return null;
    const prev = biomesData?.iconsDensity?.[res.k];
    return {
      i: res.id,
      name: res.name,
      previousDensity: typeof prev === "number" ? prev : 0,
    };
  },
  apply(id: number, value: number): void {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, id);
    if (!res || !Array.isArray(biomesData?.iconsDensity)) {
      throw new Error(`Biome ${id} not found.`);
    }
    biomesData.iconsDensity[res.k] = value;
    const redraw = getGlobal<() => void>("drawReliefIcons");
    if (typeof redraw === "function") {
      try {
        redraw();
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

export function createSetBiomeIconsDensityTool(
  runtime: BiomeIconsDensityRuntime = defaultBiomeIconsDensityRuntime,
): Tool {
  return {
    name: "set_biome_icons_density",
    description: `Set a biome's relief-icon density — writes biomesData.iconsDensity[k] and best-effort calls drawReliefIcons() (the same redraw the Biomes Editor's "Regenerate Icons" button triggers). Controls roughly how many lowland relief icons (trees / dunes / grass / swamp / etc.) are drawn per cell of this biome; the renderer divides by 100 to derive a Poisson-disc sampling radius and an early-exit probability. 0 disables biome-level relief icons for this biome entirely (Marine and Glacier are 0 by default); high-ground (height ≥ 50) relief icons are unaffected. Integer in [${MIN_DENSITY}, ${MAX_DENSITY}]; defaults range from 0 (Marine / Glacier) to 250 (Wetland). The Biomes Editor does not expose a per-row density input — it is a data-only field. Matches by numeric id (0 = Marine) or case-insensitive current name; biomes whose name slot is 'removed' are skipped.`,
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine) or case-insensitive current biome name.",
        },
        density: {
          type: "integer",
          minimum: MIN_DENSITY,
          maximum: MAX_DENSITY,
          description: `Integer in [${MIN_DENSITY}, ${MAX_DENSITY}]. Default biome densities range from 0 (Marine / Glacier) to 250 (Wetland); 0 disables biome relief icons for this biome.`,
        },
      },
      required: ["biome", "density"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        biome?: unknown;
        density?: unknown;
      };

      if (!isValidRef(input.biome)) {
        return errorResult(
          "biome must be a non-negative integer id or a non-empty name string.",
        );
      }
      const d = input.density;
      if (
        typeof d !== "number" ||
        !Number.isInteger(d) ||
        d < MIN_DENSITY ||
        d > MAX_DENSITY
      ) {
        return errorResult(
          `density must be an integer in [${MIN_DENSITY}, ${MAX_DENSITY}].`,
        );
      }

      const ref = input.biome as number | string;
      const current = runtime.find(ref);
      if (!current) {
        return errorResult(`No biome found matching ${JSON.stringify(ref)}.`);
      }

      try {
        runtime.apply(current.i, d);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousDensity: current.previousDensity,
        density: d,
      });
    },
  };
}

export const setBiomeIconsDensityTool = createSetBiomeIconsDensityTool();
