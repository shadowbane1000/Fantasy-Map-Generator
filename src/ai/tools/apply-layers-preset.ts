import {
  createAliasResolver,
  errorResult,
  getGlobal,
  okResult,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const CANONICAL_PRESETS = [
  "political",
  "cultural",
  "religions",
  "provinces",
  "biomes",
  "heightmap",
  "physical",
  "poi",
  "military",
  "emblems",
  "landmass",
] as const;

export type CanonicalPreset = (typeof CANONICAL_PRESETS)[number];

const ALIAS_MAP: Record<string, CanonicalPreset> = {
  politics: "political",
  states: "political",
  "political map": "political",
  "political view": "political",
  culture: "cultural",
  cultures: "cultural",
  "culture map": "cultural",
  "cultural map": "cultural",
  religion: "religions",
  "religion map": "religions",
  "religions map": "religions",
  religious: "religions",
  province: "provinces",
  "province map": "provinces",
  "provinces map": "provinces",
  biome: "biomes",
  "biome map": "biomes",
  "biomes map": "biomes",
  ecology: "biomes",
  height: "heightmap",
  "height map": "heightmap",
  elevation: "heightmap",
  topographic: "heightmap",
  topo: "heightmap",
  "physical map": "physical",
  geography: "physical",
  geographic: "physical",
  "points of interest": "poi",
  "points-of-interest": "poi",
  "markers view": "poi",
  "markers map": "poi",
  "military map": "military",
  "army map": "military",
  armies: "military",
  regiments: "military",
  heraldry: "emblems",
  "coats of arms": "emblems",
  arms: "emblems",
  "land mass": "landmass",
  "land only": "landmass",
  minimalist: "landmass",
  minimal: "landmass",
  outline: "landmass",
};

const resolvePreset = createAliasResolver<CanonicalPreset>(
  CANONICAL_PRESETS,
  ALIAS_MAP,
);

export interface PresetRuntime {
  apply(presetName: string): void;
}

export const defaultPresetRuntime: PresetRuntime = {
  apply(presetName: string): void {
    const fn = getGlobal<(name: string) => void>("handleLayersPresetChange");
    if (typeof fn !== "function") {
      throw new Error("handleLayersPresetChange is not available yet.");
    }
    fn(presetName);
  },
};

export function createApplyLayersPresetTool(
  runtime: PresetRuntime = defaultPresetRuntime,
): Tool {
  return {
    name: "apply_layers_preset",
    description: `Apply a named map preset, which toggles several layers at once to a recognizable view. Supported presets: ${CANONICAL_PRESETS.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          description: `Preset name or alias. One of: ${CANONICAL_PRESETS.join(", ")}, or common aliases like 'culture map', 'heightmap', 'religion'.`,
        },
      },
      required: ["preset"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { preset?: unknown };
      if (typeof input.preset !== "string" || !input.preset.trim()) {
        return errorResult("preset must be a non-empty string.", {
          supported: [...CANONICAL_PRESETS],
        });
      }

      const canonical = resolvePreset(input.preset);
      if (!canonical) {
        return errorResult(`Unknown preset: ${input.preset}`, {
          supported: [...CANONICAL_PRESETS],
        });
      }

      try {
        runtime.apply(canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ preset: canonical });
    },
  };
}

export const applyLayersPresetTool = createApplyLayersPresetTool();
