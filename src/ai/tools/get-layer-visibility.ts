import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { LAYER_SPECS, type LayerSpec } from "./set-layer-visibility";

// Lowercase canonical + alias lookup (same surface accepted by
// `set_layer_visibility`).
const LOOKUP = new Map<string, LayerSpec>();
for (const spec of LAYER_SPECS as readonly LayerSpec[]) {
  LOOKUP.set(spec.canonical.toLowerCase(), spec);
  for (const alias of spec.aliases) LOOKUP.set(alias.toLowerCase(), spec);
}

export interface LayerVisibilityRuntime {
  isOn(buttonId: string): boolean;
}

// Mirrors the `isOn` half of `defaultLayerRuntime` in
// `set-layer-visibility.ts`. Prefer the globally-installed `layerIsOn` helper
// (`public/modules/ui/layers.js`); fall back to reading the button's
// `.buttonoff` class directly; finally treat absence of DOM as "hidden" for
// SSR / test environments.
export const defaultLayerVisibilityRuntime: LayerVisibilityRuntime = {
  isOn(buttonId: string): boolean {
    const fn = getGlobal<(id: string) => boolean>("layerIsOn");
    if (typeof fn === "function") return fn(buttonId);
    if (typeof document === "undefined") return false;
    const el = document.getElementById(buttonId);
    return !!el && !el.classList.contains("buttonoff");
  },
};

function supportedLayerList(): string[] {
  return (LAYER_SPECS as readonly LayerSpec[]).map((l) => l.canonical);
}

export function createGetLayerVisibilityTool(
  runtime: LayerVisibilityRuntime = defaultLayerVisibilityRuntime,
): Tool {
  return {
    name: "get_layer_visibility",
    description:
      `Read the current shown/hidden state of one or every named map layer — ` +
      `the read-side inverse of \`set_layer_visibility\`. Uses the same ` +
      `layer names and aliases (rivers, borders, state borders, religions, ` +
      `cultures, heightmap, biomes, ice, labels, burgs, routes, markers, ` +
      `relief, emblems, zones, grid, coordinates, compass, temperature, ` +
      `precipitation, population, scale bar, vignette, texture, rulers). ` +
      `Visibility is derived the same way the UI derives it — a layer is ` +
      `"visible" iff its toolbar button (e.g. \`#toggleRivers\`, ` +
      `\`#toggleBorders\`) lacks the \`.buttonoff\` CSS class (same check ` +
      `as the global \`layerIsOn()\` helper in ` +
      `\`public/modules/ui/layers.js\`). Accepts optional \`layer\` — when ` +
      `omitted, returns every registered layer in canonical order; when ` +
      `provided (case-insensitive, aliases accepted), returns a one-entry ` +
      `array for that layer. Read-only — never toggles anything. Returns ` +
      `\`{ok, layers: [{layer, visible}, ...]}\`. Errors when the supplied ` +
      `\`layer\` is a non-empty string that does not resolve to any known ` +
      `layer (error payload includes the canonical \`supported\` list).`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Optional. Layer name or common alias (same surface as " +
            "`set_layer_visibility`: 'rivers', 'state borders', 'religions', " +
            "'heightmap', 'burgs', etc.). Omit to report every layer.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { layer?: unknown };

      if (input.layer === undefined || input.layer === null) {
        const layers = (LAYER_SPECS as readonly LayerSpec[]).map((spec) => ({
          layer: spec.canonical,
          visible: runtime.isOn(spec.buttonId),
        }));
        return okResult({ layers });
      }

      if (typeof input.layer !== "string") {
        return errorResult("layer must be a string when provided.", {
          supported: supportedLayerList(),
        });
      }
      if (!input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }

      const key = input.layer.trim().toLowerCase();
      const spec = LOOKUP.get(key);
      if (!spec) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      return okResult({
        layers: [
          { layer: spec.canonical, visible: runtime.isOn(spec.buttonId) },
        ],
      });
    },
  };
}

export const getLayerVisibilityTool = createGetLayerVisibilityTool();
