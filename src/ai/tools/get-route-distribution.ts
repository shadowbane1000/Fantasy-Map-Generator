import { errorResult, getPack, okResult, type RawRoute } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RouteDistributionEntry {
  group: string;
  count: number;
  points: number;
  percentage: number;
}

export interface RouteDistribution {
  total_routes: number;
  total_points: number;
  by_group: RouteDistributionEntry[];
}

export interface RouteDistributionPackLike {
  routes?: RawRoute[];
}

/**
 * Pure aggregator: given the world state (`pack`), walk `pack.routes`,
 * skip any falsy / `removed: true` entry, bucket each surviving route
 * by its effective group, and compute per-group
 * `{count, points, percentage}` plus `total_routes` / `total_points`.
 *
 * Effective group is `route.group` (canonical `roads` / `trails` /
 * `searoutes`, though any non-empty string is preserved verbatim so
 * legacy or custom group labels stay visible); otherwise `"unknown"`
 * when the raw route omits `group` or has a non-string / empty-string
 * value. Unlike burgs / rivers this walk does NOT skip `i === 0`: route
 * ids are non-contiguous and `route.i === 0` is a real route.
 *
 * Sorting: `count` desc, then `group` asc on ties. Returns
 * `"not-ready"` when `pack` / `pack.routes` is missing.
 */
export function readRouteDistributionFromPack(
  pack: RouteDistributionPackLike | undefined,
): RouteDistribution | "not-ready" {
  if (!pack?.routes) return "not-ready";

  interface Bucket {
    group: string;
    count: number;
    points: number;
  }
  const buckets = new Map<string, Bucket>();
  let totalRoutes = 0;
  let totalPoints = 0;

  for (const route of pack.routes) {
    if (!route || typeof route !== "object") continue;
    if (route.removed) continue;

    totalRoutes += 1;
    const pts = Array.isArray(route.points) ? route.points.length : 0;
    totalPoints += pts;

    const effectiveGroup =
      typeof route.group === "string" && route.group.length > 0
        ? route.group
        : "unknown";

    let bucket = buckets.get(effectiveGroup);
    if (!bucket) {
      bucket = { group: effectiveGroup, count: 0, points: 0 };
      buckets.set(effectiveGroup, bucket);
    }
    bucket.count += 1;
    bucket.points += pts;
  }

  const by_group: RouteDistributionEntry[] = Array.from(buckets.values())
    .map((b) => ({
      group: b.group,
      count: b.count,
      points: b.points,
      percentage: totalRoutes > 0 ? (b.count / totalRoutes) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });

  return {
    total_routes: totalRoutes,
    total_points: totalPoints,
    by_group,
  };
}

export interface RouteDistributionRuntime {
  readDistribution(): RouteDistribution | "not-ready";
}

export const defaultRouteDistributionRuntime: RouteDistributionRuntime = {
  readDistribution(): RouteDistribution | "not-ready" {
    return readRouteDistributionFromPack(getPack<RouteDistributionPackLike>());
  },
};

export function createGetRouteDistributionTool(
  runtime: RouteDistributionRuntime = defaultRouteDistributionRuntime,
): Tool {
  return {
    name: "get_route_distribution",
    description:
      'Read aggregate counts and summed point-count per route group (roads / trails / searoutes) across the current map — the route-level parallel of `get_river_distribution` / `get_burg_distribution` / `get_feature_distribution` / `get_biome_distribution` and an aggregate companion to `list_routes` / `find_routes_by_group` / `get_route_info`. Iterates `pack.routes` linearly, skipping any falsy / `removed: true` entries (same walk `list_routes` / `find_routes_by_group` use). Unlike burgs / rivers, routes do NOT have a placeholder at index 0 — route ids are non-contiguous and `route.i === 0` is a real route, so it is INCLUDED. Each surviving route is bucketed by its effective group: `route.group` when present as a non-empty string (canonical values are `roads`, `trails`, `searoutes`, but the bucket key is preserved verbatim so legacy or custom group labels remain visible — e.g. a stray `"Roads"` would bucket separately from `"roads"`); otherwise `"unknown"` when the raw route omits `group` or has a non-string / empty-string value. Per group, accumulates `count` and `points` (sum of `route.points.length`, with missing / non-array points counted as `0`). `percentage` is each group\'s share of `total_routes` — `count / total_routes * 100`, floating, `0` when `total_routes` is `0`. Also surfaces `total_routes` (count of non-removed routes) and `total_points` (summed points across the same set) for a quick summary. Takes no parameters. Returns `{ ok, total_routes, total_points, by_group }` sorted by `count` descending with ties broken by `group` ascending. When the map has no active routes, `total_routes` is `0`, `total_points` is `0`, and `by_group` is `[]`, still `ok: true`. Useful for the "how many roads vs trails vs sea lanes are there?" / "what\'s the route makeup of this world?" / "give me a route breakdown" report, quick audits after `set_route_group` / `rename_route` / `remove_route` / route-generator reruns, and sanity checks when comparing two maps\' transportation networks. Read-only — never mutates the pack. Errors only on un-generated map (`pack` / `pack.routes` missing). Requires an Anthropic API key (see "Getting an API key" below).',
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

export const getRouteDistributionTool = createGetRouteDistributionTool();
