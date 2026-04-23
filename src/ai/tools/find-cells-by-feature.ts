import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT = 10000;
export const MAX_FIND_CELLS_BY_FEATURE_LIMIT = 100000;

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

interface FeatureEntry {
  i?: number;
  type?: string;
  name?: string;
}

export interface FindCellsByFeaturePackLike {
  features?: ArrayLike<FeatureEntry | 0 | undefined | null>;
  cells?: {
    f?: ArrayLike<number> | number[];
  };
}

export interface FindCellsByFeatureHit {
  i: number;
  type: string | null;
  name: string | null;
  cells: number[];
  count: number;
}

export type FindCellsByFeatureResult =
  | FindCellsByFeatureHit
  | "not-ready"
  | "not-found";

/**
 * Pure collector: given the world state (`pack`), return every cell index
 * whose `pack.cells.f[i]` matches the requested feature id. `count`
 * reports the full unlimited total even when `cells` is truncated by
 * `limit`.
 *
 * Returns `"not-ready"` when pack / features / cells / cells.f are
 * missing, and `"not-found"` when the feature id resolves to the
 * index-0 placeholder, is out of range, or points at an empty slot.
 */
export function findFeatureCellsInPack(
  pack: FindCellsByFeaturePackLike | undefined,
  featureId: number,
  limit: number,
): FindCellsByFeatureResult {
  if (!pack || !pack.features || !pack.cells) return "not-ready";
  const cellFeature = pack.cells.f;
  if (!cellFeature || typeof cellFeature.length !== "number")
    return "not-ready";

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
  const name =
    typeof entry.name === "string" && entry.name.length > 0 ? entry.name : null;

  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = cellFeature.length;
  for (let k = 0; k < length; k++) {
    if (cellFeature[k] === featureId) {
      count++;
      if (cells.length < cap) cells.push(k);
    }
  }

  return { i, type, name, cells, count };
}

export interface FindCellsByFeatureRuntime {
  collect(featureId: number, limit: number): FindCellsByFeatureResult;
}

export const defaultFindCellsByFeatureRuntime: FindCellsByFeatureRuntime = {
  collect(featureId, limit) {
    return findFeatureCellsInPack(
      getPack<FindCellsByFeaturePackLike>(),
      featureId,
      limit,
    );
  },
};

function parseFeatureRef(
  value: unknown,
): { ok: true; ref: number } | { ok: false; error: string } {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    return {
      ok: false,
      error: "feature is required and must be an integer.",
    };
  }
  if (value < 1) {
    return {
      ok: false,
      error:
        "feature must be >= 1 (pack.features[0] is a placeholder slot, not a real feature).",
    };
  }
  return { ok: true, ref: value };
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CELLS_BY_FEATURE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CELLS_BY_FEATURE_LIMIT}].`;
  }
  return value;
}

export function createFindCellsByFeatureTool(
  runtime: FindCellsByFeatureRuntime = defaultFindCellsByFeatureRuntime,
): Tool {
  return {
    name: "find_cells_by_feature",
    description:
      "List every packed-grid cell index currently assigned to a given feature (continent / island / lake / ocean) — the feature parallel of `find_cells_by_biome` (filters by biome) and a bulk counterpart to `get_feature_info` (which reports only the feature's cell count, not the cell ids). Required `feature` is the numeric feature id — an index into `pack.features`, starting at 1 (`pack.features[0]` is a sentinel placeholder the generator writes as `0`, not a real feature). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so huge features (oceans, big continents) don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.f` linearly and collects every index `k` where the value equals the requested feature id. Returns `{ok, feature: {i, type, name}, cells, count}` where `type` is the raw feature.type (island / lake / ocean) and `name` is null when absent or empty (some oceans lack names). Useful as a first step for bulk feature-wide operations — flatten every cell on a landmass (`set_cell_height` per cell), audit burgs on an island, pick candidate cells for `add_burg` / `add_marker` on a specific continent, paint zones across a lake, or feed cells into `get_cell_info` for a localized feature tour. Read-only; does not mutate state or trigger redraws. Errors on un-generated map (pack / pack.features / pack.cells.f missing), feature <= 0 (the placeholder), out-of-range ids, an empty slot, or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        feature: {
          type: "integer",
          minimum: 1,
          description:
            "Feature id — index into pack.features, starting at 1 (pack.features[0] is a placeholder).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_BY_FEATURE_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_BY_FEATURE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["feature"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { feature?: unknown; limit?: unknown };

      const refParsed = parseFeatureRef(input.feature);
      if (!refParsed.ok) return errorResult(refParsed.error);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.collect(refParsed.ref, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No feature found matching ${JSON.stringify(refParsed.ref)}.`,
        );
      }

      return okResult({
        feature: { i: result.i, type: result.type, name: result.name },
        cells: result.cells,
        count: result.count,
      });
    },
  };
}

export const findCellsByFeatureTool = createFindCellsByFeatureTool();
