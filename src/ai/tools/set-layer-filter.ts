import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { LAYER_SPECS, type LayerSpec } from "./set-layer-visibility";

// Mirror of `set-layer-opacity.ts`'s canonical → SVG-id table. Kept local
// rather than re-exported across tools so each layer-attr tool remains
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

const LAYER_LOOKUP = new Map<string, ResolvedLayer>();
for (const spec of LAYER_SPECS as readonly LayerSpec[]) {
  const svgId = CANONICAL_TO_SVG_ID[spec.canonical];
  if (!svgId) continue;
  const entry: ResolvedLayer = { canonical: spec.canonical, svgId };
  LAYER_LOOKUP.set(spec.canonical.toLowerCase(), entry);
  for (const alias of spec.aliases)
    LAYER_LOOKUP.set(alias.toLowerCase(), entry);
}

// Filter ids defined in `<g id="filters">` inside `src/index.html`. The Style
// Editor populates its dropdowns (`styleFilterInput`,
// `styleStatesBodyFilter`, `styleScaleBarBackgroundFilter`) by enumerating
// `#filters > filter` — we mirror that enumeration here so the tool's
// accepted value set matches the UI's dropdown exactly.
export const FILTER_IDS = [
  "blurFilter",
  "blur1",
  "blur3",
  "blur5",
  "blur7",
  "blur10",
  "splotch",
  "bluredSplotch",
  "dropShadow",
  "dropShadow01",
  "dropShadow05",
  "outline",
  "pencil",
  "turbulence",
  "paper",
  "crumpled",
  "filter-grayscale",
  "filter-sepia",
  "filter-dingy",
  "filter-tint",
] as const;

export type FilterId = (typeof FILTER_IDS)[number];

const FILTER_ID_SET = new Set<string>(FILTER_IDS);

// Friendly names for common filters. Kept small — `FILTER_IDS` is already the
// canonical surface and is exposed via the `supported` error payload.
const FILTER_ALIASES: Record<string, FilterId> = {
  sepia: "filter-sepia",
  grayscale: "filter-grayscale",
  greyscale: "filter-grayscale",
  dingy: "filter-dingy",
  tint: "filter-tint",
  shadow: "dropShadow",
  "drop shadow": "dropShadow",
  "drop-shadow": "dropShadow",
  blur: "blur3",
};

const CLEAR_KEYS = new Set(["", "none", "null"]);

export interface LayerFilterRuntime {
  readFilter(svgId: string): string | null;
  setFilter(svgId: string, filter: string): void;
}

export const defaultLayerFilterRuntime: LayerFilterRuntime = {
  readFilter(svgId: string): string | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(svgId);
    if (!el) return null;
    const v = el.getAttribute("filter");
    return v === null || v === "" ? null : v;
  },
  setFilter(svgId: string, filter: string): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(svgId);
    if (!el) {
      throw new Error(`Layer element #${svgId} not found in DOM.`);
    }
    el.setAttribute("filter", filter);
  },
};

function supportedLayerList(): string[] {
  return (LAYER_SPECS as readonly LayerSpec[])
    .map((l) => l.canonical)
    .filter((c) => c in CANONICAL_TO_SVG_ID);
}

function resolveFilterId(raw: string): FilterId | null {
  // Accept raw id first (case-sensitive match for the canonical ids in
  // FILTER_IDS so `filter-sepia` keeps its hyphen). Fall back to a
  // lowercased alias lookup.
  if (FILTER_ID_SET.has(raw)) return raw as FilterId;
  const lower = raw.trim().toLowerCase();
  if (FILTER_ID_SET.has(lower)) return lower as FilterId;
  const aliased = FILTER_ALIASES[lower];
  if (aliased) return aliased;
  // Some canonical ids differ only in casing (e.g. `dropShadow`). Try a
  // case-insensitive match against `FILTER_IDS` as a last step so users
  // don't trip on `dropshadow` vs `dropShadow`.
  for (const id of FILTER_IDS) {
    if (id.toLowerCase() === lower) return id;
  }
  return null;
}

export function createSetLayerFilterTool(
  runtime: LayerFilterRuntime = defaultLayerFilterRuntime,
): Tool {
  return {
    name: "set_layer_filter",
    description:
      `Apply an SVG filter to a named map layer — the same side-effect as ` +
      `the Style Editor's per-layer filter dropdown ` +
      `(\`styleFilterInput.on("change", …)\` in ` +
      `\`public/modules/ui/style.js\`). Writes the \`filter\` attribute on ` +
      `the layer's \`<g>\` element as \`url(#<id>)\`, or \`""\` to clear. ` +
      `The id must match a filter defined in \`<g id="filters">\` inside ` +
      `\`src/index.html\`. Valid ids: ${FILTER_IDS.join(", ")}. Friendly ` +
      `aliases are also accepted: 'sepia' → filter-sepia, 'grayscale' / ` +
      `'greyscale' → filter-grayscale, 'dingy' → filter-dingy, 'tint' → ` +
      `filter-tint, 'shadow' / 'drop shadow' → dropShadow, 'blur' → blur3. ` +
      `Pass \`filter=""\` or \`filter="none"\` to clear the filter. Layer ` +
      `names and aliases match \`set_layer_visibility\` / ` +
      `\`set_layer_opacity\` (rivers, biomes, markers, state borders, ` +
      `heightmap, burgs, cultures, religions, …). Returns ` +
      `{ok, layer, previousFilter, filter}.`,
    input_schema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description:
            "Layer name or common alias. Examples: 'rivers', 'biomes', " +
            "'markers', 'state borders', 'heightmap', 'burgs'.",
        },
        filter: {
          type: "string",
          description:
            "Filter id (e.g. 'dropShadow', 'filter-sepia', 'blur3', " +
            "'crumpled') or friendly alias ('sepia', 'grayscale', 'shadow', " +
            "'blur'). Pass '' or 'none' to clear the filter.",
        },
      },
      required: ["layer", "filter"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        layer?: unknown;
        filter?: unknown;
      };

      if (typeof input.layer !== "string" || !input.layer.trim()) {
        return errorResult("layer must be a non-empty string.", {
          supported: supportedLayerList(),
        });
      }
      if (typeof input.filter !== "string") {
        return errorResult("filter must be a string.", {
          supported: FILTER_IDS.slice(),
        });
      }

      const layerKey = input.layer.trim().toLowerCase();
      const entry = LAYER_LOOKUP.get(layerKey);
      if (!entry) {
        return errorResult(`Unknown layer: ${input.layer}`, {
          supported: supportedLayerList(),
        });
      }

      const rawFilter = input.filter.trim();
      const isClear = CLEAR_KEYS.has(rawFilter.toLowerCase());

      let filterAttr: string;
      if (isClear) {
        filterAttr = "";
      } else {
        const id = resolveFilterId(rawFilter);
        if (!id) {
          return errorResult(`Unknown filter: ${input.filter}`, {
            supported: FILTER_IDS.slice(),
          });
        }
        filterAttr = `url(#${id})`;
      }

      const previousFilter = runtime.readFilter(entry.svgId);

      try {
        runtime.setFilter(entry.svgId, filterAttr);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        layer: entry.canonical,
        previousFilter,
        filter: filterAttr,
      });
    },
  };
}

export const setLayerFilterTool = createSetLayerFilterTool();
