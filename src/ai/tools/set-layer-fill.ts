import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { LAYER_SPECS, type LayerSpec } from "./set-layer-visibility";
import { isValidCssColor } from "./set-state-color";

// Mirror of `set-layer-opacity.ts`'s canonical → SVG-id table. Kept local
// rather than re-exported across tools so each style tool remains
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

export interface LayerFillRuntime {
  readFill(svgId: string): string | null;
  setFill(svgId: string, fill: string): void;
}

export const defaultLayerFillRuntime: LayerFillRuntime = {
  readFill(svgId: string): string | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    return el.getAttribute("fill");
  },
  setFill(svgId: string, fill: string): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(svgId);
    if (!el) {
      throw new Error(`Layer element #${svgId} not found in DOM.`);
    }
    el.setAttribute("fill", fill);
  },
};

function supportedLayerList(): string[] {
  return (LAYER_SPECS as readonly LayerSpec[])
    .map((l) => l.canonical)
    .filter((c) => c in CANONICAL_TO_SVG_ID);
}

export function createSetLayerFillTool(
  runtime: LayerFillRuntime = defaultLayerFillRuntime,
): Tool {
  return {
    name: "set_layer_fill",
    description:
      `Set the fill color of a named SVG map layer — the same side-effect ` +
      `as the Style Editor's per-layer fill color picker ` +
      `(\`styleFillInput\`). Writes the \`fill\` attribute on the layer's ` +
      `\`<g>\` element (e.g. #biomes, #rivers, #markers, #terrs for ` +
      `heightmap, #regions for states). SVG children inherit \`fill\` from ` +
      `the group unless they set their own. Accepts hex colors ` +
      `(#rgb, #rgba, #rrggbb, #rrggbbaa), functional colors ` +
      `(rgb(), rgba(), hsl(), hsla()), and common CSS named colors. ` +
      `Distinct from \`set_layer_opacity\` (alpha), ` +
      `\`set_layer_stroke_width\`, \`set_layer_filter\`, and ` +
      `\`set_layer_visibility\` (hide/show). Layer names and aliases match ` +
      `\`set_layer_visibility\`. Returns ` +
      `{ok, layer, previousFill, fill}.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer name or common alias. Examples: 'rivers', 'biomes', " +
            "'markers', 'state borders', 'heightmap', 'burgs'.",
        },
        fill: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or a named " +
            "color like 'red').",
        },
      },
      required: ["layer", "fill"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        fill?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      if (!isValidCssColor(input.fill)) {
        return errorResult(
          "fill must be a valid CSS color (#hex, rgb(), rgba(), hsl(), hsla(), or a named color).",
        );
      }

      const key = input.layer.trim().toLowerCase();
      const entry = LOOKUP.get(key);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const fill = input.fill.trim();
      const previousFill = runtime.readFill(entry.svgId);

      try {
        runtime.setFill(entry.svgId, fill);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: entry.canonical,
        previousFill,
        fill,
      });
    },
  };
}

export const setLayerFillTool = createSetLayerFillTool();
