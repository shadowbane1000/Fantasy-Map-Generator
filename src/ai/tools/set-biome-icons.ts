import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

export interface BiomeIconsRef {
  i: number;
  name: string;
  previousIcons: string[];
}

export interface BiomeIconsRuntime {
  find(ref: number | string): BiomeIconsRef | null;
  apply(id: number, icons: string[]): void;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  icons?: string[][];
}

function copyIcons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") out.push(entry);
  }
  return out;
}

export const defaultBiomeIconsRuntime: BiomeIconsRuntime = {
  find(ref) {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return null;
    return {
      i: res.id,
      name: res.name,
      previousIcons: copyIcons(biomesData?.icons?.[res.k]),
    };
  },
  apply(id: number, icons: string[]): void {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    const res = findBiomeByRef(biomesData, id);
    if (!res || !Array.isArray(biomesData?.icons)) {
      throw new Error(`Biome ${id} not found.`);
    }
    biomesData.icons[res.k] = [...icons];
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

function validateIcons(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    if (entry.trim().length === 0) return null;
    out.push(entry);
  }
  return out;
}

export function createSetBiomeIconsTool(
  runtime: BiomeIconsRuntime = defaultBiomeIconsRuntime,
): Tool {
  return {
    name: "set_biome_icons",
    description:
      'Set a biome\'s relief-icon list — writes biomesData.icons[k] (the flat string[] parsed form; duplicates within the array control relative frequency, e.g. ["grass","grass","grass","grass","grass","grass","grass","grass","grass","acacia"] is ~9:1 grass:acacia) and best-effort calls drawReliefIcons() so the change appears immediately. Controls which relief icons (acacia, cactus, conifer, deadTree, deciduous, dune, grass, palm, swamp, etc.) the renderer samples per cell of this biome; pair with set_biome_icons_density, which controls how many are drawn per cell. Empty array is accepted and disables per-biome icon sampling (the same idiom used by Marine and Glacier defaults, which also have iconsDensity 0). No upper cap on the list length. Matches by numeric id (0 = Marine) or case-insensitive current name; biomes whose name slot is "removed" are skipped. Data-only except for the best-effort redraw — the Biomes Editor does not expose a per-row icon-list input.',
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine) or case-insensitive current biome name.",
        },
        icons: {
          type: "array",
          items: { type: "string" },
          description:
            "Flat list of icon-name strings. Each entry must be a non-empty trimmed string. Duplicates are preserved and weight relative frequency (e.g. 9 'grass' + 1 'acacia' → ~9:1). Empty array is allowed and means no per-biome relief icons.",
        },
      },
      required: ["biome", "icons"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        biome?: unknown;
        icons?: unknown;
      };

      if (!isValidRef(input.biome)) {
        return errorResult(
          "biome must be a non-negative integer id or a non-empty name string.",
        );
      }
      const icons = validateIcons(input.icons);
      if (icons === null) {
        return errorResult(
          "icons must be an array of non-empty strings (duplicates allowed as frequency weights; empty array is accepted).",
        );
      }

      const ref = input.biome as number | string;
      const current = runtime.find(ref);
      if (!current) {
        return errorResult(`No biome found matching ${JSON.stringify(ref)}.`);
      }

      try {
        runtime.apply(current.i, icons);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousIcons: current.previousIcons,
        icons: [...icons],
      });
    },
  };
}

export const setBiomeIconsTool = createSetBiomeIconsTool();
