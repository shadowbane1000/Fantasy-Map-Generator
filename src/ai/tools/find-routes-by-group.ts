import { errorResult, getPack, okResult, type RawRoute } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  ROUTE_GROUPS,
  type RouteGroup,
  resolveRouteGroup,
} from "./list-routes";

export const DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT = 10000;
export const MAX_FIND_ROUTES_BY_GROUP_LIMIT = 100000;

export interface FindRoutesByGroupHit {
  i: number;
  name: string | null;
  group: RouteGroup;
  feature: number | null;
  points_count: number;
}

export interface FindRoutesByGroupPayload {
  group: RouteGroup;
  routes: FindRoutesByGroupHit[];
  count: number;
}

export interface FindRoutesByGroupQuery {
  group: RouteGroup;
  limit: number;
}

export type FindRoutesByGroupResult = FindRoutesByGroupPayload | "not-ready";

interface PackLike {
  routes?: RawRoute[];
}

function routeGroupMatches(r: RawRoute, filter: RouteGroup): boolean {
  if (typeof r.group !== "string") return false;
  return r.group.trim().toLowerCase() === filter;
}

/**
 * Pure scanner: collects every active route in `pack.routes` whose
 * `route.group` matches the resolved canonical `RouteGroup` filter
 * (case-insensitive compare against `route.group.trim()`). Skips
 * `removed: true` entries and null / undefined array slots. `count`
 * reports the full unlimited total even when `routes` is truncated by
 * `limit`.
 */
export function findRoutesByGroupInPack(
  pack: PackLike | undefined,
  query: FindRoutesByGroupQuery,
): FindRoutesByGroupResult {
  if (!pack || !pack.routes) return "not-ready";

  const cap = query.limit > 0 ? query.limit : 0;
  const routes: FindRoutesByGroupHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.routes.length; k++) {
    const r = pack.routes[k];
    if (!r) continue;
    if (r.removed) continue;
    if (!routeGroupMatches(r, query.group)) continue;

    count++;
    if (routes.length < cap) {
      const feature = r.feature;
      routes.push({
        i: r.i,
        name: typeof r.name === "string" ? r.name : null,
        group: query.group,
        feature:
          typeof feature === "number" && Number.isFinite(feature)
            ? feature
            : null,
        points_count: Array.isArray(r.points) ? r.points.length : 0,
      });
    }
  }

  return { group: query.group, routes, count };
}

export interface FindRoutesByGroupRuntime {
  find(query: FindRoutesByGroupQuery): FindRoutesByGroupResult;
}

export const defaultFindRoutesByGroupRuntime: FindRoutesByGroupRuntime = {
  find(query) {
    return findRoutesByGroupInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindRoutesByGroupQuery;
  error?: string;
  extra?: Record<string, unknown>;
}

function parseLimit(raw: unknown): number | string {
  if (raw === undefined || raw === null) {
    return DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT;
  }
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_FIND_ROUTES_BY_GROUP_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_ROUTES_BY_GROUP_LIMIT}].`;
  }
  return raw;
}

function parseInput(rawInput: unknown): ParsedInput {
  const args = (rawInput ?? {}) as {
    group?: unknown;
    limit?: unknown;
  };

  if (args.group === undefined || args.group === null) {
    return {
      error: "group is required.",
      extra: { supported: [...ROUTE_GROUPS] },
    };
  }
  if (typeof args.group !== "string") {
    return {
      error: "group must be a string.",
      extra: { supported: [...ROUTE_GROUPS] },
    };
  }
  if (!args.group.trim()) {
    return {
      error: "group must be a non-empty string.",
      extra: { supported: [...ROUTE_GROUPS] },
    };
  }

  const resolved = resolveRouteGroup(args.group);
  if (!resolved) {
    return {
      error: `Unknown route group: ${JSON.stringify(args.group)}.`,
      extra: { supported: [...ROUTE_GROUPS] },
    };
  }

  const limitParsed = parseLimit(args.limit);
  if (typeof limitParsed === "string") return { error: limitParsed };

  return { query: { group: resolved, limit: limitParsed } };
}

export function createFindRoutesByGroupTool(
  runtime: FindRoutesByGroupRuntime = defaultFindRoutesByGroupRuntime,
): Tool {
  return {
    name: "find_routes_by_group",
    description: `List every active route on the map whose \`route.group\` matches a caller-supplied group — the group-only parallel of \`find_markers_by_type\` / \`find_burgs_by_type\` and the unpaginated, return-everything companion to \`list_routes\` (which paginates and accepts the same group filter). Required \`group\` (string) is matched case-insensitively against canonical ${ROUTE_GROUPS.join(" / ")}; common aliases are accepted (\`road\`, \`trail\`, \`sea lanes\`, \`sea-routes\`, \`sealane\`, …) and the resolved canonical label is echoed back in the response. Optional \`limit\` (integer in [1, ${MAX_FIND_ROUTES_BY_GROUP_LIMIT}], default ${DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT}) caps the returned \`routes\` array so large groups don't blow up the response; \`count\` always reports the full unlimited total. Iterates \`pack.routes\` linearly, skipping \`removed: true\` entries and null slots. Returns \`{ ok, group, routes, count }\` where each route is \`{ i, name, group, feature, points_count }\` — \`i\` is \`route.i\` (the non-contiguous numeric id, matches \`route.i\` not the array index), \`name\` is \`route.name\` when a string else \`null\` (the Routes Overview populates names lazily, so unopened routes may be \`null\`), \`group\` is the canonical filter echo, \`feature\` is the landmass / ocean feature id when finite else \`null\`, and \`points_count\` is \`route.points.length\` when an array else \`0\`. When no route matches, \`routes\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on missing map (\`pack\` or \`pack.routes\` not ready), missing / non-string / empty \`group\`, unknown \`group\`, or out-of-range \`limit\`. Useful as a first step for bulk route operations keyed by group — audit every sea lane, feed route ids into \`get_route_info\` / \`rename_route\` / \`set_route_group\` / \`set_route_lock\` / \`remove_route\`, or pre-filter candidates before calling \`list_routes\` with \`min_length\`. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description: `Route group to filter on. Case-insensitive, accepts canonical values (${ROUTE_GROUPS.join(", ")}) and aliases like 'road', 'trail', 'sea lanes', 'sea-routes', 'sealane'.`,
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_ROUTES_BY_GROUP_LIMIT,
          description: `Maximum routes to return in the response (default ${DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["group"],
    },
    execute(rawInput: unknown): ToolResult {
      const parsed = parseInput(rawInput);
      if (parsed.error) return errorResult(parsed.error, parsed.extra);
      const query = parsed.query as FindRoutesByGroupQuery;
      const result = runtime.find(query);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({
        group: result.group,
        routes: result.routes,
        count: result.count,
      });
    },
  };
}

export const findRoutesByGroupTool = createFindRoutesByGroupTool();
