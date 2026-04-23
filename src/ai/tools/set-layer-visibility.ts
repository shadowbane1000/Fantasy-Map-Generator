import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface LayerSpec {
  canonical: string;
  toggleFn: string;
  buttonId: string;
  aliases: string[];
}

export const LAYER_SPECS: LayerSpec[] = [
  {
    canonical: "heightmap",
    toggleFn: "toggleHeight",
    buttonId: "toggleHeight",
    aliases: ["heightmap", "height", "height map", "elevation"],
  },
  {
    canonical: "temperature",
    toggleFn: "toggleTemperature",
    buttonId: "toggleTemperature",
    aliases: ["temperature", "temp"],
  },
  {
    canonical: "biomes",
    toggleFn: "toggleBiomes",
    buttonId: "toggleBiomes",
    aliases: ["biomes", "biome"],
  },
  {
    canonical: "precipitation",
    toggleFn: "togglePrecipitation",
    buttonId: "togglePrecipitation",
    aliases: ["precipitation", "rain", "rainfall"],
  },
  {
    canonical: "population",
    toggleFn: "togglePopulation",
    buttonId: "togglePopulation",
    aliases: ["population"],
  },
  {
    canonical: "cells",
    toggleFn: "toggleCells",
    buttonId: "toggleCells",
    aliases: ["cells", "voronoi cells", "grid cells"],
  },
  {
    canonical: "ice",
    toggleFn: "toggleIce",
    buttonId: "toggleIce",
    aliases: ["ice"],
  },
  {
    canonical: "cultures",
    toggleFn: "toggleCultures",
    buttonId: "toggleCultures",
    aliases: ["cultures", "culture"],
  },
  {
    canonical: "religions",
    toggleFn: "toggleReligions",
    buttonId: "toggleReligions",
    aliases: ["religions", "religion"],
  },
  {
    canonical: "states",
    toggleFn: "toggleStates",
    buttonId: "toggleStates",
    aliases: ["states", "state"],
  },
  {
    canonical: "borders",
    toggleFn: "toggleBorders",
    buttonId: "toggleBorders",
    aliases: [
      "borders",
      "border",
      "state borders",
      "province borders",
      "political borders",
    ],
  },
  {
    canonical: "provinces",
    toggleFn: "toggleProvinces",
    buttonId: "toggleProvinces",
    aliases: ["provinces", "province"],
  },
  {
    canonical: "grid",
    toggleFn: "toggleGrid",
    buttonId: "toggleGrid",
    aliases: ["grid", "hex grid", "square grid", "overlay"],
  },
  {
    canonical: "coordinates",
    toggleFn: "toggleCoordinates",
    buttonId: "toggleCoordinates",
    aliases: ["coordinates", "coords", "latitude and longitude"],
  },
  {
    canonical: "compass",
    toggleFn: "toggleCompass",
    buttonId: "toggleCompass",
    aliases: ["compass", "compass rose"],
  },
  {
    canonical: "relief",
    toggleFn: "toggleRelief",
    buttonId: "toggleRelief",
    aliases: ["relief", "relief icons", "mountains", "trees"],
  },
  {
    canonical: "texture",
    toggleFn: "toggleTexture",
    buttonId: "toggleTexture",
    aliases: ["texture", "paper texture"],
  },
  {
    canonical: "rivers",
    toggleFn: "toggleRivers",
    buttonId: "toggleRivers",
    aliases: ["rivers", "river"],
  },
  {
    canonical: "routes",
    toggleFn: "toggleRoutes",
    buttonId: "toggleRoutes",
    aliases: ["routes", "roads", "trails", "sea lanes"],
  },
  {
    canonical: "military",
    toggleFn: "toggleMilitary",
    buttonId: "toggleMilitary",
    aliases: ["military", "army", "regiments"],
  },
  {
    canonical: "markers",
    toggleFn: "toggleMarkers",
    buttonId: "toggleMarkers",
    aliases: ["markers", "points of interest", "poi", "pins"],
  },
  {
    canonical: "labels",
    toggleFn: "toggleLabels",
    buttonId: "toggleLabels",
    aliases: ["labels", "text labels", "names"],
  },
  {
    canonical: "burgs",
    toggleFn: "toggleBurgIcons",
    buttonId: "toggleBurgIcons",
    aliases: [
      "burgs",
      "burg icons",
      "cities",
      "towns",
      "settlements",
      "city icons",
    ],
  },
  {
    canonical: "rulers",
    toggleFn: "toggleRulers",
    buttonId: "toggleRulers",
    aliases: ["rulers", "measurement rulers"],
  },
  {
    canonical: "scale bar",
    toggleFn: "toggleScaleBar",
    buttonId: "toggleScaleBar",
    aliases: ["scale bar", "scalebar", "scale"],
  },
  {
    canonical: "zones",
    toggleFn: "toggleZones",
    buttonId: "toggleZones",
    aliases: ["zones", "zone"],
  },
  {
    canonical: "emblems",
    toggleFn: "toggleEmblems",
    buttonId: "toggleEmblems",
    aliases: ["emblems", "coats of arms", "heraldry"],
  },
  {
    canonical: "vignette",
    toggleFn: "toggleVignette",
    buttonId: "toggleVignette",
    aliases: ["vignette"],
  },
];

const LOOKUP = new Map<string, LayerSpec>();
for (const spec of LAYER_SPECS) {
  LOOKUP.set(spec.canonical.toLowerCase(), spec);
  for (const alias of spec.aliases) LOOKUP.set(alias.toLowerCase(), spec);
}

export interface LayerRuntime {
  isOn(buttonId: string): boolean;
  toggle(toggleFn: string): void;
}

export const defaultLayerRuntime: LayerRuntime = {
  isOn(buttonId: string): boolean {
    const fn = getGlobal<(id: string) => boolean>("layerIsOn");
    if (typeof fn === "function") return fn(buttonId);
    if (typeof document === "undefined") return false;
    const el = document.getElementById(buttonId);
    return !!el && !el.classList.contains("buttonoff");
  },
  toggle(toggleFn: string): void {
    const fn = getGlobal<() => void>(toggleFn);
    if (typeof fn !== "function") {
      throw new Error(`Toggle function ${toggleFn} is not available yet.`);
    }
    fn();
  },
};

function supportedLayerList(): string[] {
  return LAYER_SPECS.map((l) => l.canonical);
}

export function createSetLayerVisibilityTool(
  runtime: LayerRuntime = defaultLayerRuntime,
): Tool {
  return {
    name: "set_layer_visibility",
    description:
      "Show or hide a named map layer (e.g., rivers, borders, states, religions, cultures, heightmap, biomes, ice, labels, burgs, routes, markers, relief, emblems). Idempotent: no-ops if the layer is already in the requested state.",
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer name or common alias. Examples: 'rivers', 'state borders', 'religions', 'heightmap', 'burgs'.",
        },
        visible: {
          type: "boolean",
          description: "true to show the layer, false to hide it.",
        },
      },
      required: ["layer", "visible"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        visible?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      if (typeof input.visible !== "boolean") {
        return errorResult("visible must be a boolean.");
      }

      const key = input.layer.trim().toLowerCase();
      const spec = LOOKUP.get(key);
      if (!spec) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const currentlyOn = runtime.isOn(spec.buttonId);
      if (currentlyOn === input.visible) {
        return okResult({
          layer: spec.canonical,
          visible: input.visible,
          noop: true,
        });
      }

      try {
        runtime.toggle(spec.toggleFn);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: spec.canonical,
        visible: input.visible,
        noop: false,
      });
    },
  };
}

export const setLayerVisibilityTool = createSetLayerVisibilityTool();
