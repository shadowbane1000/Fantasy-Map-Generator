import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const STYLE_PRESETS = [
  "default",
  "ancient",
  "gloom",
  "pale",
  "light",
  "watercolor",
  "clean",
  "atlas",
  "darkSeas",
  "cyberpunk",
  "night",
  "monochrome",
] as const;

export type StylePreset = (typeof STYLE_PRESETS)[number];

const LOOKUP = new Map<string, StylePreset>();
for (const p of STYLE_PRESETS) LOOKUP.set(p.toLowerCase(), p);

export function resolveStylePreset(value: unknown): StylePreset | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface StylePresetRuntime {
  apply(preset: StylePreset): Promise<void> | void;
}

export const defaultStylePresetRuntime: StylePresetRuntime = {
  async apply(preset) {
    const fn =
      getGlobal<(preset: string) => Promise<void> | void>("changeStyle");
    if (typeof fn !== "function") {
      throw new Error(
        "changeStyle is not available yet; the map hasn't finished loading.",
      );
    }
    await fn(preset);
  },
};

export function createSetStylePresetTool(
  runtime: StylePresetRuntime = defaultStylePresetRuntime,
): Tool {
  return {
    name: "set_style_preset",
    description: `Switch the map's visual theme — same side-effect as the Options panel's Style Preset selector. One of: ${STYLE_PRESETS.join(", ")} (case-insensitive). Delegates to window.changeStyle(preset) which applies the preset's style JSON to every SVG element and re-renders burg icons and labels. Custom presets (fmgStyle_*) are out of scope — this tool is for the 12 built-in themes.`,
    input_schema: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: [...STYLE_PRESETS],
          description: `One of: ${STYLE_PRESETS.join(", ")} (case-insensitive).`,
        },
      },
      required: ["preset"],
    },
    async execute(rawInput: unknown): Promise<ToolResult> {
      const input = (rawInput ?? {}) as { preset?: unknown };

      if (typeof input.preset !== "string" || !input.preset.trim()) {
        return errorResult("preset must be a non-empty string.", {
          supported: [...STYLE_PRESETS],
        });
      }
      const canonical = resolveStylePreset(input.preset);
      if (!canonical) {
        return errorResult(
          `Unknown style preset: ${JSON.stringify(input.preset)}.`,
          { supported: [...STYLE_PRESETS] },
        );
      }

      try {
        await runtime.apply(canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ preset: canonical });
    },
  };
}

export const setStylePresetTool = createSetStylePresetTool();
