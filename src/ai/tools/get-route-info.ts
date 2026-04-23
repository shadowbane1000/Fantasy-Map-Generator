import { errorResult, getPack, okResult, type RawRoute } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRouteByRef } from "./rename-route";

export const DEFAULT_POINTS_LIMIT = 5000;
export const MAX_POINTS_LIMIT = 5000;

export type RoutePoint = [number, number, number];

export interface RouteInfo {
  i: number;
  name: string | null;
  group: string;
  length: number;
  lock: boolean;
  feature: number;
  points: RoutePoint[];
  points_count: number;
}

export type ReadRouteInfoResult = RouteInfo | "not-ready" | "not-found";

export interface RouteInfoPackLike {
  routes?: RawRoute[];
}

function coercePoint(raw: unknown): RoutePoint {
  if (!Array.isArray(raw)) return [0, 0, 0];
  const x = typeof raw[0] === "number" ? raw[0] : 0;
  const y = typeof raw[1] === "number" ? raw[1] : 0;
  const c = typeof raw[2] === "number" ? raw[2] : 0;
  return [x, y, c];
}

function computeLength(route: RawRoute, points: RoutePoint[] | null): number {
  if (typeof route.length === "number" && Number.isFinite(route.length)) {
    return route.length;
  }
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    const dx = points[k][0] - points[k - 1][0];
    const dy = points[k][1] - points[k - 1][1];
    total += Math.hypot(dx, dy);
  }
  return total;
}

export function readRouteInfoFromPack(
  pack: RouteInfoPackLike | undefined,
  ref: number | string,
  limit: number = DEFAULT_POINTS_LIMIT,
): ReadRouteInfoResult {
  if (!pack?.routes) return "not-ready";

  const route = findRouteByRef(pack.routes, ref);
  if (!route) return "not-found";

  const rawPoints = Array.isArray(route.points) ? route.points : [];
  const allPoints: RoutePoint[] = rawPoints.map(coercePoint);
  const pointsCount = allPoints.length;

  const cappedLimit = Math.max(0, Math.min(limit, MAX_POINTS_LIMIT));
  const points =
    cappedLimit >= pointsCount ? allPoints : allPoints.slice(0, cappedLimit);

  const length = computeLength(route, allPoints);

  return {
    i: route.i,
    name: route.name ?? null,
    group: route.group ?? "",
    length,
    lock: !!route.lock,
    feature: typeof route.feature === "number" ? route.feature : 0,
    points,
    points_count: pointsCount,
  };
}

export interface RouteInfoRuntime {
  readRouteInfo(ref: number | string, limit: number): ReadRouteInfoResult;
}

export const defaultRouteInfoRuntime: RouteInfoRuntime = {
  readRouteInfo(ref: number | string, limit: number): ReadRouteInfoResult {
    return readRouteInfoFromPack(getPack<RouteInfoPackLike>(), ref, limit);
  },
};

function parseRouteRef(
  value: unknown,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      return {
        ok: false,
        error:
          "route must be a non-negative integer id or a non-empty name string.",
      };
    }
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error:
      "route must be a non-negative integer id or a non-empty name string.",
  };
}

export function createGetRouteInfoTool(
  runtime: RouteInfoRuntime = defaultRouteInfoRuntime,
): Tool {
  return {
    name: "get_route_info",
    description: `Read detailed info for a single route (road, trail, or sea lane) — the per-route parallel of get_burg_info / get_river_info / get_zone_info. Required \`route\` is a numeric route id (matches route.i — note ids start at 0, so 0 is a real route; unlike states/burgs/religions there is no placeholder slot) OR the route's current case-insensitive name, resolved via the shared findRouteByRef (skips removed routes). Optional \`limit\` (integer 0-${MAX_POINTS_LIMIT}, default ${DEFAULT_POINTS_LIMIT}) truncates the returned \`points\` array for very long routes — \`points_count\` still reports the true total regardless of truncation. Returns \`i\`, \`name\` (route.name, null when unset — routes are often unnamed because the Routes Overview populates name lazily in the UI), \`group\` (roads / trails / searoutes), \`length\` (from route.length when the Routes Overview has populated it; otherwise the tool sums Euclidean segment lengths across the points array — so it always has a value), \`lock\` (boolean, mirrors route.lock), \`feature\` (landmass feature id for land routes, water-feature id for sea lanes — raw route.feature, 0 when unset), \`points\` (array of [x, y, cellI] triples, each triple is one cell centroid along the path; truncated to \`limit\`), and \`points_count\` (full points length before truncation). Useful before rename_route / set_route_group / set_route_lock / remove_route, or for reasoning about which cells a route crosses (pair with get_cell_info). Errors on un-generated map, an unresolvable / removed ref, or an out-of-range limit. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: ["integer", "string"],
          description:
            "Numeric route id (matches route.i, non-contiguous, starts at 0) or the route's current case-insensitive name.",
        },
        limit: {
          type: "integer",
          minimum: 0,
          maximum: MAX_POINTS_LIMIT,
          description: `Maximum number of point triples to return in the points array (default ${DEFAULT_POINTS_LIMIT}). The full length is always reported via points_count regardless of truncation.`,
        },
      },
      required: ["route"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { route?: unknown; limit?: unknown };

      const parsed = parseRouteRef(input.route);
      if (!parsed.ok) return errorResult(parsed.error);

      let limit = DEFAULT_POINTS_LIMIT;
      if (input.limit !== undefined && input.limit !== null) {
        if (
          typeof input.limit !== "number" ||
          !Number.isInteger(input.limit) ||
          input.limit < 0 ||
          input.limit > MAX_POINTS_LIMIT
        ) {
          return errorResult(
            `limit must be an integer in [0, ${MAX_POINTS_LIMIT}].`,
          );
        }
        limit = input.limit;
      }

      const result = runtime.readRouteInfo(parsed.ref, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No route found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getRouteInfoTool = createGetRouteInfoTool();
