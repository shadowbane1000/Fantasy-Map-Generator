import { errorResult, getPack, okResult, type RawBurg } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT = 10000;
export const MAX_FIND_BURGS_BY_FEATURE_LIMIT = 100000;

export interface FindBurgsByFeatureHit {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
}

export interface FindBurgsByFeaturePayload {
  burgs: FindBurgsByFeatureHit[];
  count: number;
}

export type FindBurgsByFeatureResult = FindBurgsByFeaturePayload | "not-ready";

export interface ResolvedFeature {
  i: number;
  type: string | null;
  name: string | null;
}

export type ResolveFeatureResult = ResolvedFeature | "not-ready" | "not-found";

interface ArrayLikeOf<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  burgs?: RawBurg[];
  features?: ArrayLikeOf<
    | {
        i?: number;
        type?: string;
        name?: string;
      }
    | 0
    | undefined
    | null
  >;
  cells?: {
    f?: Array<number | undefined> | number[];
  };
}

/**
 * Resolve a feature id (positive integer) against `pack.features`.
 * `pack.features[0]` is a sentinel placeholder the generator writes
 * as `0`, so it's rejected as `not-found`. Returns `{i, type, name}`
 * where `type` is the raw feature.type string (or null when unset)
 * and `name` is the raw feature.name (or null when absent / empty —
 * some oceans lack a name).
 */
export function resolveFeatureRefInPack(
  pack: PackLike | undefined,
  featureId: number,
): ResolveFeatureResult {
  if (!pack?.features) return "not-ready";
  const features = pack.features;
  if (featureId <= 0) return "not-found";
  if (featureId >= features.length) return "not-found";
  const entry = features[featureId];
  if (!entry || typeof entry !== "object") return "not-found";
  const i = typeof entry.i === "number" ? entry.i : featureId;
  const type = typeof entry.type === "string" ? entry.type : null;
  const name =
    typeof entry.name === "string" && entry.name.length > 0 ? entry.name : null;
  return { i, type, name };
}

/**
 * Pure scanner: collects every active burg in `pack.burgs` whose home
 * cell's feature slot (`pack.cells.f[burg.cell]`) matches the requested
 * `featureI`. Skips the index-0 burg placeholder and `removed: true`
 * entries. `count` reports the full unlimited total even when `burgs`
 * is truncated by `limit`.
 */
export function findBurgsByFeatureInPack(
  pack: PackLike | undefined,
  featureI: number,
  limit: number,
): FindBurgsByFeatureResult {
  if (!pack?.burgs) return "not-ready";
  const cellFeature = pack.cells?.f;
  if (!cellFeature) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const burgs: FindBurgsByFeatureHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    if (typeof b.cell !== "number") continue;

    const cf = (cellFeature as Array<number | undefined>)[b.cell];
    if (cf !== featureI) continue;

    count++;
    if (burgs.length < cap) {
      burgs.push({
        i: b.i,
        name: typeof b.name === "string" ? b.name : "",
        x: typeof b.x === "number" ? b.x : 0,
        y: typeof b.y === "number" ? b.y : 0,
        population: typeof b.population === "number" ? b.population : 0,
        capital: b.capital === 1,
      });
    }
  }

  return { burgs, count };
}

export interface FindBurgsByFeatureRuntime {
  resolveFeature(featureId: number): ResolveFeatureResult;
  find(featureI: number, limit: number): FindBurgsByFeatureResult;
}

export const defaultFindBurgsByFeatureRuntime: FindBurgsByFeatureRuntime = {
  resolveFeature(featureId) {
    return resolveFeatureRefInPack(getPack<PackLike>(), featureId);
  },
  find(featureI, limit) {
    return findBurgsByFeatureInPack(getPack<PackLike>(), featureI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_BURGS_BY_FEATURE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_BURGS_BY_FEATURE_LIMIT}].`;
  }
  return value;
}

function parseFeatureRef(
  value: unknown,
): { ok: true; ref: number } | { ok: false; error: string } {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1
  ) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error:
      "feature must be an integer >= 1 (pack.features[0] is a placeholder).",
  };
}

export function createFindBurgsByFeatureTool(
  runtime: FindBurgsByFeatureRuntime = defaultFindBurgsByFeatureRuntime,
): Tool {
  return {
    name: "find_burgs_by_feature",
    description:
      "List every active burg (city or town) sitting on a given map feature — the feature-filtered parallel of `list_burgs` and the bulk counterpart to `get_feature_info` (which reports feature metadata but not the burgs on it). A feature is a landmass / ocean / lake entry in `pack.features`, the same object `get_cell_info` returns a thin ref for under `feature`. Required `feature` identifies the target feature by numeric id (integer >= 1 — `pack.features[0]` is a sentinel placeholder the generator writes as `0`, not a real feature; passing 0 or a negative id errors). Features don't carry a `fullName`, and names can legitimately be null (some oceans are unnamed), so resolution is by numeric id only. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `burgs` array; `count` still reports the full unlimited total. Features are stored per-cell in `pack.cells.f` — NOT on the burg directly — so matching uses the canonical indirection that `get_cell_info` uses: for each active burg, compare `pack.cells.f[burg.cell] === featureI`. Iterates `pack.burgs` linearly, skipping the index-0 placeholder and any `removed: true` burgs, and returns `{ ok, feature, burgs, count }` where `feature` is `{ i, type, name }` echoing the resolved feature (with `name` possibly `null` for unnamed oceans) and each burg is `{ i, name, x, y, population, capital }`. `population` is the raw engine value (`burg.population`) — scale by `populationRate × urbanization` like `list_burgs` for display. `capital` is `true` only when `burg.capital === 1`. When the feature has no burgs, `burgs` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, an unresolvable feature ref (missing / non-integer / `<= 0` / out-of-range / empty slot), or out-of-range `limit`. Useful as a first step for bulk burg operations scoped to a landmass — rename every burg on an island, audit capitals / ports on a continent (post-filter on `capital`), feed burg ids into `get_burg_info`, or filter candidates for `rename_burg` / `move_burg` / `set_burg_population`. Requires an Anthropic API key (see 'Getting an API key' below).",
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
          maximum: MAX_FIND_BURGS_BY_FEATURE_LIMIT,
          description: `Maximum burgs to return in the response (default ${DEFAULT_FIND_BURGS_BY_FEATURE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["feature"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { feature?: unknown; limit?: unknown };

      const parsed = parseFeatureRef(input.feature);
      if (!parsed.ok) return errorResult(parsed.error);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const resolved = runtime.resolveFeature(parsed.ref);
      if (resolved === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (resolved === "not-found") {
        return errorResult(
          `No feature found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }

      const result = runtime.find(resolved.i, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        feature: { i: resolved.i, type: resolved.type, name: resolved.name },
        burgs: result.burgs,
        count: result.count,
      });
    },
  };
}

export const findBurgsByFeatureTool = createFindBurgsByFeatureTool();
