import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { LAYER_SPECS, type LayerSpec } from "./set-layer-visibility";

// Mirror of `set-layer-opacity.ts` / `set-layer-stroke-width.ts` /
// `set-layer-stroke-color.ts`'s canonical → SVG-id table. Kept local
// rather than re-exported across tools so each stroke-style tool remains
// self-contained (no cross-tool coupling / drift surface).
const CANONICAL_TO_SVG_ID: Record<string, string> = {
  heightmap: "terrs",
  temperature: "temperature",
  biomes: "biomes",
  precipitation: "prec",
  population: "population",
  cells: "cells",
  ice: "ice",
  cultures: "cults",
  religions: "relig",
  states: "regions",
  borders: "borders",
  provinces: "provs",
  grid: "gridOverlay",
  coordinates: "coordinates",
  compass: "compass",
  relief: "terrain",
  texture: "texture",
  rivers: "rivers",
  routes: "routes",
  military: "armies",
  markers: "markers",
  labels: "labels",
  burgs: "burgIcons",
  rulers: "ruler",
  "scale bar": "scaleBar",
  zones: "zones",
  emblems: "emblems",
  vignette: "vignette",
};

interface ResolvedLayer {
  canonical: string;
  svgId: string;
}

const LOOKUP = new Map<string, ResolvedLayer>();
for (const spec of LAYER_SPECS as readonly LayerSpec[]) {
  const svgId = CANONICAL_TO_SVG_ID[spec.canonical];
  if (!svgId) continue;
  const entry: ResolvedLayer = { canonical: spec.canonical, svgId };
  LOOKUP.set(spec.canonical.toLowerCase(), entry);
  for (const alias of spec.aliases) LOOKUP.set(alias.toLowerCase(), entry);
}

export interface LayerStrokeDasharrayRuntime {
  readDasharray(svgId: string): string | null;
  setDasharray(svgId: string, dasharray: string): void;
}

export const defaultLayerStrokeDasharrayRuntime: LayerStrokeDasharrayRuntime = {
  readDasharray(svgId: string): string | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    return el.getAttribute("stroke-dasharray");
  },
  setDasharray(svgId: string, dasharray: string): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(svgId);
    if (!el) {
      throw new Error(`Layer element #${svgId} not found in DOM.`);
    }
    el.setAttribute("stroke-dasharray", dasharray);
  },
};

function supportedLayerList(): string[] {
  return (LAYER_SPECS as readonly LayerSpec[])
    .map((l) => l.canonical)
    .filter((c) => c in CANONICAL_TO_SVG_ID);
}

// Loose SVG stroke-dasharray validator: space/comma-separated non-negative
// finite numbers. Empty string or "none" (case-insensitive) is also valid
// and represents a clear. Separator between numbers is either a comma
// (optionally surrounded by whitespace) or one-or-more whitespace chars —
// double commas, leading / trailing commas and non-numeric tokens are
// rejected.
const DASHARRAY_RE = /^\d+(?:\.\d+)?(?:(?:\s*,\s*|\s+)\d+(?:\.\d+)?)*$/;
function normalizeDasharray(raw: unknown): { ok: true; value: string } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "none") {
    return { ok: true, value: "" };
  }
  if (!DASHARRAY_RE.test(trimmed)) return null;
  return { ok: true, value: trimmed };
}

export function createSetLayerStrokeDasharrayTool(
  runtime: LayerStrokeDasharrayRuntime = defaultLayerStrokeDasharrayRuntime,
): Tool {
  return {
    name: "set_layer_stroke_dasharray",
    description:
      `Set the stroke-dasharray of a named SVG map layer — the same ` +
      `side-effect as the Style Editor's stroke-dasharray input ` +
      `(\`styleStrokeDasharrayInput\`). Writes the \`stroke-dasharray\` ` +
      `attribute on the layer's \`<g>\` element (e.g. #borders, #rivers, ` +
      `#routes, #terrs for heightmap, #regions for states). SVG children ` +
      `inherit \`stroke-dasharray\` from the group unless they set their ` +
      `own. \`dasharray\` is an SVG stroke-dasharray string: space- or ` +
      `comma-separated non-negative finite numbers (e.g. "5,5", ` +
      `"2 4 2", "10 5"). Pass an empty string or "none" to clear the ` +
      `dash pattern (return to solid strokes). Distinct from ` +
      `\`set_layer_stroke_width\` (thickness), \`set_layer_stroke_color\` ` +
      `(color), \`set_layer_opacity\` (alpha), \`set_layer_visibility\` ` +
      `(hide/show) and \`apply_layers_preset\` (bulk on/off). Layer names ` +
      `and aliases match \`set_layer_visibility\`. Returns ` +
      `{ok, layer, previousDasharray, dasharray}.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer name or common alias. Examples: 'rivers', 'biomes', " +
            "'markers', 'state borders', 'heightmap', 'burgs'.",
        },
        dasharray: {
          type: "string",
          description:
            "SVG stroke-dasharray value — space- or comma-separated " +
            "non-negative numbers (e.g. '5,5', '2 4 2', '10 5'). " +
            "Empty string or 'none' clears the dash pattern.",
        },
      },
      required: ["layer", "dasharray"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        dasharray?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      const normalized = normalizeDasharray(input.dasharray);
      if (!normalized) {
        return errorResult(
          "dasharray must be a space- or comma-separated string of " +
            "non-negative finite numbers (e.g. '5,5', '2 4 2'), an empty " +
            "string, or 'none'.",
        );
      }

      const key = input.layer.trim().toLowerCase();
      const entry = LOOKUP.get(key);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const previousDasharray = runtime.readDasharray(entry.svgId);

      try {
        runtime.setDasharray(entry.svgId, normalized.value);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: entry.canonical,
        previousDasharray,
        dasharray: normalized.value,
      });
    },
  };
}

export const setLayerStrokeDasharrayTool = createSetLayerStrokeDasharrayTool();
