import {
  createAliasResolver,
  createPaginatedListTool,
  getPack,
  type RawRoute,
} from "./_shared";
import type { Tool } from "./index";

export type RouteGroup = "roads" | "trails" | "searoutes";

export const ROUTE_GROUPS: RouteGroup[] = ["roads", "trails", "searoutes"];

const resolveGroup = createAliasResolver<RouteGroup>(ROUTE_GROUPS, {
  road: "roads",
  trail: "trails",
  searoute: "searoutes",
  "sea-routes": "searoutes",
  "sea routes": "searoutes",
  "sea lanes": "searoutes",
  "sea-lanes": "searoutes",
  sealane: "searoutes",
  sealanes: "searoutes",
});

export function resolveRouteGroup(value: unknown): RouteGroup | null {
  return resolveGroup(value);
}

export interface RouteSummary {
  i: number;
  group: string;
  name: string | null;
  length: number;
  feature: number;
  points: number;
  cells: number;
  merged: boolean;
}

export interface RoutePackLike {
  routes?: RawRoute[];
}

export function readRoutesFromPack(
  pack: RoutePackLike | undefined,
): RouteSummary[] | null {
  if (!pack?.routes) return null;
  return pack.routes
    .filter((r): r is RawRoute => !!r && !r.removed)
    .map(
      (r): RouteSummary => ({
        i: r.i,
        group: r.group ?? "",
        name: r.name ?? null,
        length: typeof r.length === "number" ? r.length : 0,
        feature: typeof r.feature === "number" ? r.feature : 0,
        points: Array.isArray(r.points) ? r.points.length : 0,
        cells: Array.isArray(r.cells) ? r.cells.length : 0,
        merged: !!r.merged,
      }),
    );
}

export interface RoutesRuntime {
  readRoutes(): RouteSummary[] | null;
}

export const defaultRoutesRuntime: RoutesRuntime = {
  readRoutes(): RouteSummary[] | null {
    return readRoutesFromPack(getPack<RoutePackLike>());
  },
};

interface RouteFilters {
  group: RouteGroup | null;
  minLength: number | null;
}

export function createListRoutesTool(
  runtime: RoutesRuntime = defaultRoutesRuntime,
): Tool {
  return createPaginatedListTool<RouteSummary, RouteFilters>({
    name: "list_routes",
    description:
      "List routes on the current map: roads, trails, and sea lanes. Each entry reports id, group, name, length, feature (landmass/water id), and counts of points/cells (arrays themselves omitted for size). Skips removed routes. Paginated. Optional filters: group (one of roads, trails, searoutes — case-insensitive with aliases like 'sea lanes') and min_length. Note: name and length are populated lazily by the Routes Overview in the UI; routes that haven't been displayed may report null/0.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum number of routes to return (default 100).",
        },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Number of routes to skip (default 0).",
        },
        group: {
          type: "string",
          description:
            "Optional group filter: 'roads', 'trails', or 'searoutes' (aliases: 'road', 'trail', 'sea lanes'). Case-insensitive.",
        },
        min_length: {
          type: "number",
          minimum: 0,
          description: "Optional minimum route length.",
        },
      },
    },
    collectionKey: "routes",
    notReadyError:
      "Map is not ready yet; cannot list routes. Wait for the 'map:generated' event on window.",
    read: () => runtime.readRoutes(),
    parseFilters: (input) => {
      let group: RouteGroup | null = null;
      let minLength: number | null = null;
      if (input.group !== undefined && input.group !== null) {
        const resolved = resolveRouteGroup(input.group);
        if (!resolved) {
          return `group must be one of: ${ROUTE_GROUPS.join(", ")}.`;
        }
        group = resolved;
      }
      if (input.min_length !== undefined && input.min_length !== null) {
        if (
          typeof input.min_length !== "number" ||
          !Number.isFinite(input.min_length) ||
          input.min_length < 0
        ) {
          return "min_length must be a non-negative finite number.";
        }
        minLength = input.min_length;
      }
      return { group, minLength };
    },
    applyFilters: (items, filters) => {
      let filtered = items;
      if (filters.group !== null) {
        const g = filters.group;
        filtered = filtered.filter((r) => r.group === g);
      }
      if (filters.minLength !== null) {
        const min = filters.minLength;
        filtered = filtered.filter((r) => r.length >= min);
      }
      return {
        items: filtered,
        echo: {
          filters: {
            group: filters.group,
            min_length: filters.minLength,
          },
        },
      };
    },
  });
}

export const listRoutesTool = createListRoutesTool();
