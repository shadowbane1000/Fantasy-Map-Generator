import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { LAYER_SPECS, type LayerSpec } from "./set-layer-visibility";

// Mirror of `set-layer-opacity.ts` / the rest of the `set-layer-*` style
// family canonical → SVG-id table. Kept local rather than re-exported
// across tools so each layer-attr tool remains self-contained (no
// cross-tool coupling / drift surface).
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

export interface LayerStyleAttrs {
  opacity: number | null;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  strokeDasharray: string | null;
  filter: string | null;
}

export interface LayerStyleRuntime {
  read(svgId: string): LayerStyleAttrs | null;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeString(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  return raw === "" ? null : raw;
}

export const defaultLayerStyleRuntime: LayerStyleRuntime = {
  read(svgId: string): LayerStyleAttrs | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    return {
      opacity: parseNumber(el.getAttribute("opacity")),
      fill: normalizeString(el.getAttribute("fill")),
      stroke: normalizeString(el.getAttribute("stroke")),
      strokeWidth: parseNumber(el.getAttribute("stroke-width")),
      strokeDasharray: normalizeString(el.getAttribute("stroke-dasharray")),
      filter: normalizeString(el.getAttribute("filter")),
    };
  },
};

function supportedLayerList(): string[] {
  return (LAYER_SPECS as readonly LayerSpec[])
    .map((l) => l.canonical)
    .filter((c) => c in CANONICAL_TO_SVG_ID);
}

export function createGetLayerStyleTool(
  runtime: LayerStyleRuntime = defaultLayerStyleRuntime,
): Tool {
  return {
    name: "get_layer_style",
    description:
      `Read back the current style attributes of a named SVG map layer — ` +
      `the read-side companion to the \`set_layer_*\` style family ` +
      `(\`set_layer_opacity\`, \`set_layer_fill\`, ` +
      `\`set_layer_stroke_color\`, \`set_layer_stroke_width\`, ` +
      `\`set_layer_stroke_dasharray\`, \`set_layer_filter\`). Reads the ` +
      `\`opacity\`, \`fill\`, \`stroke\`, \`stroke-width\`, ` +
      `\`stroke-dasharray\`, and \`filter\` attributes on the layer's ` +
      `\`<g>\` element (e.g. #biomes, #rivers, #markers, #terrs for ` +
      `heightmap, #regions for states). Numeric attrs (\`opacity\`, ` +
      `\`stroke-width\`) are parsed to numbers — unparseable or absent ` +
      `values return \`null\`. String attrs (\`fill\`, \`stroke\`, ` +
      `\`stroke-dasharray\`, \`filter\`) return the raw attribute string ` +
      `or \`null\` when absent / empty. Layer names and aliases match ` +
      `\`set_layer_visibility\` / \`set_layer_opacity\`. Read-only. ` +
      `Returns ` +
      `{ok, layer, opacity, fill, stroke, strokeWidth, strokeDasharray, filter}.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer name or common alias. Examples: 'rivers', 'biomes', " +
            "'markers', 'state borders', 'heightmap', 'burgs'.",
        },
      },
      required: ["layer"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { layer?: unknown };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }

      const key = input.layer.trim().toLowerCase();
      const entry = LOOKUP.get(key);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const attrs = runtime.read(entry.svgId);
      if (!attrs) {
        return errorResult(`Layer element #${entry.svgId} not found in DOM.`);
      }

      return okResult({
        layer: entry.canonical,
        opacity: attrs.opacity,
        fill: attrs.fill,
        stroke: attrs.stroke,
        strokeWidth: attrs.strokeWidth,
        strokeDasharray: attrs.strokeDasharray,
        filter: attrs.filter,
      });
    },
  };
}

export const getLayerStyleTool = createGetLayerStyleTool();
