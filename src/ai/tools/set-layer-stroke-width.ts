import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { LAYER_SPECS, type LayerSpec } from "./set-layer-visibility";

// Mirror of `set-layer-opacity.ts`'s canonical → SVG-id table. Kept local
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

export const WIDTH_MIN = 0;
export const WIDTH_MAX = 10;

export interface LayerStrokeWidthRuntime {
  readStrokeWidth(svgId: string): number | null;
  setStrokeWidth(svgId: string, width: number): void;
}

function parseStrokeWidth(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export const defaultLayerStrokeWidthRuntime: LayerStrokeWidthRuntime = {
  readStrokeWidth(svgId: string): number | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    return parseStrokeWidth(el.getAttribute("stroke-width"));
  },
  setStrokeWidth(svgId: string, width: number): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(svgId);
    if (!el) {
      throw new Error(`Layer element #${svgId} not found in DOM.`);
    }
    el.setAttribute("stroke-width", String(width));
  },
};

function supportedLayerList(): string[] {
  return (LAYER_SPECS as readonly LayerSpec[])
    .map((l) => l.canonical)
    .filter((c) => c in CANONICAL_TO_SVG_ID);
}

export function createSetLayerStrokeWidthTool(
  runtime: LayerStrokeWidthRuntime = defaultLayerStrokeWidthRuntime,
): Tool {
  return {
    name: "set_layer_stroke_width",
    description:
      `Set the stroke-width of a named SVG map layer — the same ` +
      `side-effect as the Style Editor's stroke-width slider ` +
      `(\`styleStrokeWidthInput\`). Writes the \`stroke-width\` attribute ` +
      `on the layer's \`<g>\` element (e.g. #borders, #rivers, #routes, ` +
      `#terrs for heightmap, #regions for states). SVG children inherit ` +
      `\`stroke-width\` from the group unless they set their own. ` +
      `\`width\` is a float in [${WIDTH_MIN}, ${WIDTH_MAX}] (matches the ` +
      `UI slider's \`min=0 max=10 step=0.01\`). Distinct from ` +
      `\`set_layer_opacity\` (alpha), \`set_layer_visibility\` (hide/show) ` +
      `and \`apply_layers_preset\` (bulk on/off). Layer names and aliases ` +
      `match \`set_layer_visibility\`. Returns ` +
      `{ok, layer, previousWidth, width}.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer name or common alias. Examples: 'rivers', 'biomes', " +
            "'markers', 'state borders', 'heightmap', 'burgs'.",
        },
        width: {
          type: "number",
          minimum: WIDTH_MIN,
          maximum: WIDTH_MAX,
          description: `Stroke width in [${WIDTH_MIN}, ${WIDTH_MAX}].`,
        },
      },
      required: ["layer", "width"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        width?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      if (
        typeof input.width !== "number" ||
        !Number.isFinite(input.width) ||
        input.width < WIDTH_MIN ||
        input.width > WIDTH_MAX
      ) {
        return errorResult(
          `width must be a finite number in [${WIDTH_MIN}, ${WIDTH_MAX}].`,
        );
      }

      const key = input.layer.trim().toLowerCase();
      const entry = LOOKUP.get(key);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const previousWidth = runtime.readStrokeWidth(entry.svgId);

      try {
        runtime.setStrokeWidth(entry.svgId, input.width);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: entry.canonical,
        previousWidth,
        width: input.width,
      });
    },
  };
}

export const setLayerStrokeWidthTool = createSetLayerStrokeWidthTool();
