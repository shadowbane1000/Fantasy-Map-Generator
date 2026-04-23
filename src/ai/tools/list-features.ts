import { createPaginatedListTool, getPack } from "./_shared";
import type { Tool } from "./index";

export interface FeatureSummary {
  i: number;
  type: string | null;
  group: string | null;
  name: string | null;
  land: boolean;
  border: boolean;
  cells: number;
  area: number;
}

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

export interface FeaturePackLike {
  features?: ArrayLike<
    | {
        i?: number;
        type?: string;
        group?: string;
        name?: string;
        land?: boolean;
        border?: boolean;
        cells?: number;
        area?: number;
      }
    | 0
    | undefined
    | null
  >;
}

export function readFeaturesFromPack(
  pack: FeaturePackLike | undefined,
): FeatureSummary[] | null {
  if (!pack || !pack.features) return null;
  const features = pack.features;
  const out: FeatureSummary[] = [];
  // pack.features[0] is a sentinel placeholder (the generator writes `0`
  // there — see src/modules/features.ts). Skip it along with any
  // falsy / non-object slot.
  for (let idx = 1; idx < features.length; idx++) {
    const entry = features[idx];
    if (!entry || typeof entry !== "object") continue;
    const i = typeof entry.i === "number" ? entry.i : idx;
    const type = typeof entry.type === "string" ? entry.type : null;
    const group = typeof entry.group === "string" ? entry.group : null;
    const name =
      typeof entry.name === "string" && entry.name.length > 0
        ? entry.name
        : null;
    const land = entry.land === true;
    const border = entry.border === true;
    const cells = typeof entry.cells === "number" ? entry.cells : 0;
    const area = typeof entry.area === "number" ? entry.area : 0;
    out.push({ i, type, group, name, land, border, cells, area });
  }
  return out;
}

export interface FeaturesRuntime {
  readFeatures(): FeatureSummary[] | null;
}

export const defaultFeaturesRuntime: FeaturesRuntime = {
  readFeatures(): FeatureSummary[] | null {
    return readFeaturesFromPack(getPack<FeaturePackLike>());
  },
};

const ALLOWED_TYPE_FILTERS = ["island", "lake", "ocean", "continent"] as const;
type FeatureTypeFilter = (typeof ALLOWED_TYPE_FILTERS)[number];

interface FeatureFilters {
  typeFilter: FeatureTypeFilter | null;
  landFilter: boolean | null;
}

export function createListFeaturesTool(
  runtime: FeaturesRuntime = defaultFeaturesRuntime,
): Tool {
  return createPaginatedListTool<FeatureSummary, FeatureFilters>({
    name: "list_features",
    description:
      "List every entry in pack.features — the oceans, continents, islands, and lakes produced by the feature-marking pass on the packed Voronoi graph. Complements get_feature_info (per-feature detail) the same way list_rivers pairs with get_river_info. Each entry reports id, type (island / lake / ocean — raw feature.type), group (island subgroup such as continent / isle, water subgroup such as ocean / freshwater / salt / dry), name (null when absent or empty), land (boolean), border (boolean, touches the map edge), cells (count of cells in the feature — raw feature.cells, not a list), and area. Skips the pack.features[0] placeholder the generator writes as `0`. Paginated (limit 1-500, default 100; offset >=0). Optional filters: type ('island' | 'lake' | 'ocean' | 'continent', case-insensitive — 'continent' is a convenience alias matching features whose group is 'continent', since continents share the raw type 'island') and land (boolean). Requires an Anthropic API key (see 'Getting an API key' below).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of features to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of features to skip (default 0).",
        },
        type: {
          type: "string",
          description:
            "Optional type filter: 'island', 'lake', 'ocean', or 'continent' (case-insensitive). 'continent' matches features whose group is 'continent'.",
        },
        land: {
          type: "boolean",
          description:
            "Optional land filter. true = only land features, false = only water features.",
        },
      },
    },
    collectionKey: "features",
    notReadyError:
      "Map is not ready yet; cannot list features. Wait for the 'map:generated' event on window.",
    read: () => runtime.readFeatures(),
    parseFilters: (input) => {
      let typeFilter: FeatureTypeFilter | null = null;
      let landFilter: boolean | null = null;
      if (input.type !== undefined && input.type !== null) {
        if (typeof input.type !== "string" || !input.type.trim()) {
          return "type must be a non-empty string.";
        }
        const normalized = input.type.trim().toLowerCase();
        if (!ALLOWED_TYPE_FILTERS.includes(normalized as FeatureTypeFilter)) {
          return `type must be one of ${ALLOWED_TYPE_FILTERS.join(", ")}.`;
        }
        typeFilter = normalized as FeatureTypeFilter;
      }
      if (input.land !== undefined && input.land !== null) {
        if (typeof input.land !== "boolean") {
          return "land must be a boolean.";
        }
        landFilter = input.land;
      }
      return { typeFilter, landFilter };
    },
    applyFilters: (items, filters) => {
      let filtered = items;
      if (filters.typeFilter !== null) {
        if (filters.typeFilter === "continent") {
          filtered = filtered.filter((f) => f.group === "continent");
        } else {
          const wanted = filters.typeFilter;
          filtered = filtered.filter((f) => f.type === wanted);
        }
      }
      if (filters.landFilter !== null) {
        const want = filters.landFilter;
        filtered = filtered.filter((f) => f.land === want);
      }
      return {
        items: filtered,
        echo: {
          filters: {
            type: filters.typeFilter,
            land: filters.landFilter,
          },
        },
      };
    },
  });
}

export const listFeaturesTool = createListFeaturesTool();
