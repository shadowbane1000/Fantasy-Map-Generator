import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { LAYER_SPECS, type LayerSpec } from "./set-layer-visibility";

// Map each canonical layer (from set-layer-visibility's LAYER_SPECS) to the
// SVG `<g>` id used by `public/main.js`. Many `LayerSpec.buttonId`s are
// `toggle<Foo>` while the SVG `<g>` id is `foo` (e.g. toggleRivers / #rivers);
// a few are intentionally different (heightmap → #terrs, states → #regions,
// cultures → #cults, religions → #relig, relief → #terrain, burgs →
// #burgIcons, military → #armies, precipitation → #prec, grid →
// #gridOverlay, rulers → #ruler).
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

export const OPACITY_MIN = 0;
export const OPACITY_MAX = 1;

export interface LayerOpacityRuntime {
  readOpacity(svgId: string): number | null;
  setOpacity(svgId: string, opacity: number): void;
}

function parseOpacity(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 1;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 1;
}

export const defaultLayerOpacityRuntime: LayerOpacityRuntime = {
  readOpacity(svgId: string): number | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    return parseOpacity(el.getAttribute("opacity"));
  },
  setOpacity(svgId: string, opacity: number): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(svgId);
    if (!el) {
      throw new Error(`Layer element #${svgId} not found in DOM.`);
    }
    el.setAttribute("opacity", String(opacity));
  },
};

function supportedLayerList(): string[] {
  return (LAYER_SPECS as readonly LayerSpec[])
    .map((l) => l.canonical)
    .filter((c) => c in CANONICAL_TO_SVG_ID);
}

export function createSetLayerOpacityTool(
  runtime: LayerOpacityRuntime = defaultLayerOpacityRuntime,
): Tool {
  return {
    name: "set_layer_opacity",
    description:
      `Set the opacity of a named SVG map layer — the same side-effect as the ` +
      `Style Editor's opacity slider (\`styleOpacityInput\`). Writes the ` +
      `\`opacity\` attribute on the layer's \`<g>\` element (e.g. ` +
      `#biomes, #rivers, #markers, #terrs for heightmap, #regions for ` +
      `states). \`opacity\` is a float in [${OPACITY_MIN}, ${OPACITY_MAX}] ` +
      `(matches the UI slider's \`min=0 max=1 step=0.01\`). 1 = fully ` +
      `opaque, 0 = fully transparent. Distinct from \`set_layer_visibility\` ` +
      `(hide/show) and \`apply_layers_preset\` (bulk on/off). Layer names ` +
      `and aliases match \`set_layer_visibility\`. Returns ` +
      `{ok, layer, previousOpacity, opacity}.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer name or common alias. Examples: 'rivers', 'biomes', " +
            "'markers', 'state borders', 'heightmap', 'burgs'.",
        },
        opacity: {
          type: "number",
          minimum: OPACITY_MIN,
          maximum: OPACITY_MAX,
          description: `Opacity in [${OPACITY_MIN}, ${OPACITY_MAX}]. 1 = opaque, 0 = transparent.`,
        },
      },
      required: ["layer", "opacity"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        opacity?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      if (
        typeof input.opacity !== "number" ||
        !Number.isFinite(input.opacity) ||
        input.opacity < OPACITY_MIN ||
        input.opacity > OPACITY_MAX
      ) {
        return errorResult(
          `opacity must be a finite number in [${OPACITY_MIN}, ${OPACITY_MAX}].`,
        );
      }

      const key = input.layer.trim().toLowerCase();
      const entry = LOOKUP.get(key);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const previousOpacity = runtime.readOpacity(entry.svgId);

      try {
        runtime.setOpacity(entry.svgId, input.opacity);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: entry.canonical,
        previousOpacity,
        opacity: input.opacity,
      });
    },
  };
}

export const setLayerOpacityTool = createSetLayerOpacityTool();
