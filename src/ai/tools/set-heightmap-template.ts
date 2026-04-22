import { createAliasResolver, errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const TEMPLATE_KEYS = [
  "volcano",
  "highIsland",
  "lowIsland",
  "continents",
  "archipelago",
  "atoll",
  "mediterranean",
  "peninsula",
  "pangea",
  "isthmus",
  "shattered",
  "taklamakan",
  "oldWorld",
  "fractious",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const DISPLAY_NAMES: Record<TemplateKey, string> = {
  volcano: "Volcano",
  highIsland: "High Island",
  lowIsland: "Low Island",
  continents: "Continents",
  archipelago: "Archipelago",
  atoll: "Atoll",
  mediterranean: "Mediterranean",
  peninsula: "Peninsula",
  pangea: "Pangea",
  isthmus: "Isthmus",
  shattered: "Shattered",
  taklamakan: "Taklamakan",
  oldWorld: "Old World",
  fractious: "Fractious",
};

const DISPLAY_ALIASES: Record<string, TemplateKey> = Object.fromEntries(
  TEMPLATE_KEYS.map((k) => [DISPLAY_NAMES[k], k]),
);

const resolveTemplate = createAliasResolver<TemplateKey>(
  TEMPLATE_KEYS,
  DISPLAY_ALIASES,
);

export function resolveTemplateKey(value: unknown): TemplateKey | null {
  if (typeof value !== "string") return null;
  // Collapse internal whitespace so "Old  World" also matches.
  const normalized = value.trim().replace(/\s+/g, " ");
  return resolveTemplate(normalized);
}

export interface HeightmapTemplateRuntime {
  read(): { template: string | null };
  write(key: TemplateKey): void;
}

export const defaultHeightmapTemplateRuntime: HeightmapTemplateRuntime = {
  read(): { template: string | null } {
    if (typeof document === "undefined") return { template: null };
    const el = document.getElementById(
      "templateInput",
    ) as HTMLSelectElement | null;
    return { template: el?.value ? el.value : null };
  },
  write(key: TemplateKey): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(
      "templateInput",
    ) as HTMLSelectElement | null;
    if (!el) {
      throw new Error(
        "#templateInput is not available yet; wait for the map to finish loading.",
      );
    }
    el.value = key;
  },
};

export function createSetHeightmapTemplateTool(
  runtime: HeightmapTemplateRuntime = defaultHeightmapTemplateRuntime,
): Tool {
  return {
    name: "set_heightmap_template",
    description: `Pick the heightmap template used on the next map regeneration. Supported templates: ${TEMPLATE_KEYS.map((k) => DISPLAY_NAMES[k]).join(", ")}. Accepts either the canonical key (e.g. "oldWorld") or the display name (e.g. "Old World"), case-insensitive. The change is passive; call regenerate_map afterwards to apply it.`,
    input_schema: {
      type: "object",
      properties: {
        template: {
          type: "string",
          description: `Template name or canonical key. One of: ${TEMPLATE_KEYS.join(", ")} (or display names like "Old World", "High Island").`,
        },
      },
      required: ["template"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { template?: unknown };
      if (typeof input.template !== "string" || !input.template.trim()) {
        return errorResult("template must be a non-empty string.", {
          supported: [...TEMPLATE_KEYS],
        });
      }

      const resolved = resolveTemplateKey(input.template);
      if (!resolved) {
        return errorResult(
          `Unknown heightmap template: ${JSON.stringify(input.template)}.`,
          {
            supported: [...TEMPLATE_KEYS],
            displayNames: TEMPLATE_KEYS.map((k) => DISPLAY_NAMES[k]),
          },
        );
      }

      const previous = runtime.read().template;

      try {
        runtime.write(resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        previousTemplate: previous,
        template: resolved,
        displayName: DISPLAY_NAMES[resolved],
      });
    },
  };
}

export const setHeightmapTemplateTool = createSetHeightmapTemplateTool();
