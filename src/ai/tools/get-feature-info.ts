import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface FeatureInfo {
  i: number;
  type: string | null;
  group: string | null;
  name: string | null;
  land: boolean;
  border: boolean;
  cells: number;
  area: number;
  firstCell: number | null;
  vertices_count: number;
}

export type ReadFeatureInfoResult = FeatureInfo | "not-ready" | "not-found";

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

export interface FeatureInfoPackLike {
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
        firstCell?: number;
        vertices?: ArrayLike<number>;
      }
    | 0
    | undefined
    | null
  >;
}

export function readFeatureInfoFromPack(
  pack: FeatureInfoPackLike | undefined,
  featureId: number,
): ReadFeatureInfoResult {
  if (!pack || !pack.features) return "not-ready";
  const features = pack.features;
  // pack.features[0] is a sentinel placeholder (the generator writes `0`
  // there — see src/modules/features.ts). Reject it along with any
  // out-of-range / falsy slot.
  if (featureId <= 0) return "not-found";
  if (featureId >= features.length) return "not-found";
  const entry = features[featureId];
  if (!entry || typeof entry !== "object") return "not-found";

  const i = typeof entry.i === "number" ? entry.i : featureId;
  const type = typeof entry.type === "string" ? entry.type : null;
  const group = typeof entry.group === "string" ? entry.group : null;
  const name =
    typeof entry.name === "string" && entry.name.length > 0 ? entry.name : null;
  const land = entry.land === true;
  const border = entry.border === true;
  const cells = typeof entry.cells === "number" ? entry.cells : 0;
  const area = typeof entry.area === "number" ? entry.area : 0;
  const firstCell =
    typeof entry.firstCell === "number" ? entry.firstCell : null;
  const vertices_count =
    entry.vertices && typeof entry.vertices.length === "number"
      ? entry.vertices.length
      : 0;

  return {
    i,
    type,
    group,
    name,
    land,
    border,
    cells,
    area,
    firstCell,
    vertices_count,
  };
}

export interface FeatureInfoRuntime {
  readFeatureInfo(featureId: number): ReadFeatureInfoResult;
}

export const defaultFeatureInfoRuntime: FeatureInfoRuntime = {
  readFeatureInfo(featureId: number): ReadFeatureInfoResult {
    return readFeatureInfoFromPack(getPack<FeatureInfoPackLike>(), featureId);
  },
};

export function createGetFeatureInfoTool(
  runtime: FeatureInfoRuntime = defaultFeatureInfoRuntime,
): Tool {
  return {
    name: "get_feature_info",
    description:
      "Read detailed info for a single map feature — the per-feature parallel of get_cell_info / get_river_info / get_biome_info. A feature is a landmass / ocean / lake entry in pack.features, the same object get_cell_info returns a thin ref for under `feature`. Required `feature` is the numeric feature id (matches pack.features[i].i — ids are contiguous from 1 upward, and pack.features[0] is a sentinel placeholder the generator writes as `0`, not a real feature). Returns `i`, `type` (island / continent / ocean / lake — raw feature.type), `group` (island subgroup such as `isle` / `continent`, water subgroup such as `ocean` / `freshwater` / `salt` / `dry` — raw feature.group; null when unset), `name` (null when absent or empty — some oceans lack names), `land` (boolean), `border` (boolean — true when this feature touches the map edge), `cells` (count of cells in the feature — raw feature.cells, not a list), `area`, `firstCell` (seed cell id used by the flood-fill — null when unavailable), and `vertices_count` (length of feature.vertices — 0 when absent). Useful for reasoning about whole landmasses / oceans / lakes before acting on their cells (add_burg, add_marker, add_zone, …). Errors on un-generated map, `feature <= 0` (the placeholder slot), out-of-range ids, or an empty slot. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        feature: {
          type: "integer",
          minimum: 1,
          description:
            "Feature id — index into pack.features, starting at 1 (pack.features[0] is a placeholder).",
        },
      },
      required: ["feature"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { feature?: unknown };
      const raw = input.feature;
      if (
        typeof raw !== "number" ||
        !Number.isFinite(raw) ||
        !Number.isInteger(raw)
      ) {
        return errorResult("feature is required and must be an integer.");
      }

      const result = runtime.readFeatureInfo(raw);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(`No feature found matching ${JSON.stringify(raw)}.`);
      }
      return okResult({ ...result });
    },
  };
}

export const getFeatureInfoTool = createGetFeatureInfoTool();
