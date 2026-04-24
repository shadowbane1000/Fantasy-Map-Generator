import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface FeatureDistributionEntry {
  type: string;
  count: number;
  cells: number;
  area: number;
  percentage: number;
}

export interface FeatureDistribution {
  features_total: number;
  land_features: number;
  water_features: number;
  by_type: FeatureDistributionEntry[];
}

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

interface RawFeature {
  i?: number;
  type?: string;
  group?: string;
  land?: boolean;
  cells?: number;
  area?: number;
}

export interface FeatureDistributionPackLike {
  features?: ArrayLike<RawFeature | 0 | undefined | null>;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Pure aggregator: given the world state (`pack`), walk
 * `pack.features[1..]`, skip the index-0 placeholder and any falsy /
 * non-object slot, group the remaining entries by their effective type,
 * and compute per-group `{count, cells, area, percentage}` plus the
 * overall `features_total`, `land_features`, `water_features` counts.
 *
 * Effective type is `"continent"` when `feature.group === "continent"`
 * (matching the `continent` convenience alias in `list_features` /
 * `find_largest_features`); otherwise the raw `feature.type` string;
 * otherwise `"unknown"`. Sorting: `count` desc, then `type` asc on
 * ties. Returns `"not-ready"` when `pack` / `pack.features` is missing.
 */
export function readFeatureDistributionFromPack(
  pack: FeatureDistributionPackLike | undefined,
): FeatureDistribution | "not-ready" {
  if (!pack?.features) return "not-ready";

  const features = pack.features;

  interface Bucket {
    type: string;
    count: number;
    cells: number;
    area: number;
  }
  const buckets = new Map<string, Bucket>();
  let featuresTotal = 0;
  let landFeatures = 0;
  let waterFeatures = 0;

  for (let idx = 1; idx < features.length; idx++) {
    const entry = features[idx];
    if (!entry || typeof entry !== "object") continue;

    featuresTotal += 1;
    if (entry.land === true) landFeatures += 1;
    else waterFeatures += 1;

    let effectiveType: string;
    if (entry.group === "continent") {
      effectiveType = "continent";
    } else if (typeof entry.type === "string" && entry.type.length > 0) {
      effectiveType = entry.type;
    } else {
      effectiveType = "unknown";
    }

    let bucket = buckets.get(effectiveType);
    if (!bucket) {
      bucket = { type: effectiveType, count: 0, cells: 0, area: 0 };
      buckets.set(effectiveType, bucket);
    }
    bucket.count += 1;
    bucket.cells += numeric(entry.cells);
    bucket.area += numeric(entry.area);
  }

  const by_type: FeatureDistributionEntry[] = Array.from(buckets.values())
    .map((b) => ({
      type: b.type,
      count: b.count,
      cells: b.cells,
      area: b.area,
      percentage: featuresTotal > 0 ? (b.count / featuresTotal) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
    });

  return {
    features_total: featuresTotal,
    land_features: landFeatures,
    water_features: waterFeatures,
    by_type,
  };
}

export interface FeatureDistributionRuntime {
  readDistribution(): FeatureDistribution | "not-ready";
}

export const defaultFeatureDistributionRuntime: FeatureDistributionRuntime = {
  readDistribution(): FeatureDistribution | "not-ready" {
    return readFeatureDistributionFromPack(
      getPack<FeatureDistributionPackLike>(),
    );
  },
};

export function createGetFeatureDistributionTool(
  runtime: FeatureDistributionRuntime = defaultFeatureDistributionRuntime,
): Tool {
  return {
    name: "get_feature_distribution",
    description:
      'Read aggregate counts and size totals per feature type across the current map — the feature-level parallel of `get_biome_distribution` / `get_state_distribution` / `get_culture_distribution` and an aggregate companion to `list_features` / `find_largest_features` / `get_feature_info`. Iterates `pack.features` linearly, skipping the index-0 placeholder the generator writes as `0` along with any falsy / non-object slot (same walk `list_features` uses). Each surviving feature is classified by an effective type: `"continent"` when `feature.group === "continent"` (matching the `continent` convenience alias in `list_features` / `find_largest_features`, since continents share the raw type `"island"` with non-continent landmasses); otherwise `feature.type` (`island`, `lake`, `ocean`); otherwise `"unknown"` when neither is populated. Per group, accumulates `count`, `cells` (sum of `feature.cells`), and `area` (sum of `feature.area`). `percentage` is each group\'s share of `features_total` — `count / features_total * 100`, floating, `0` when `features_total` is `0`. Also surfaces `land_features` (count where `feature.land === true`) and `water_features` (count where `feature.land !== true`) for a quick land-vs-water read. Takes no parameters. Returns `{ ok, features_total, land_features, water_features, by_type }` sorted by `count` descending with ties broken by `type` ascending. When the map has no features, `features_total`, `land_features`, and `water_features` are `0` and `by_type` is `[]`, still `ok: true`. Useful for the "how many islands are there?" / "what\'s the land-to-water ratio?" / "give me a feature breakdown" report, quick audits after heightmap edits that change the feature inventory (`modify_heightmap`, `invert_heightmap`, `add_hill`, `add_pit`, `add_strait`), and sanity checks when comparing two maps. Read-only — never mutates the pack. Errors only on un-generated map (`pack` / `pack.features` missing). Requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const result = runtime.readDistribution();
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getFeatureDistributionTool = createGetFeatureDistributionTool();
