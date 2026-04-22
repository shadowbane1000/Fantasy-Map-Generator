import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { ROUTE_GROUPS, resolveRouteGroup } from "./list-routes";
import { findRouteByRef } from "./rename-route";

export interface RouteGroupRef {
  i: number;
  name: string;
  previousGroup: string | null;
}

export interface RouteGroupRuntime {
  find(ref: number | string): RouteGroupRef | null;
  apply(id: number, group: string): void;
}

interface RoutePackLike {
  routes?: RawRoute[];
}

export const defaultRouteGroupRuntime: RouteGroupRuntime = {
  find(ref) {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, ref);
    if (!route) return null;
    return {
      i: route.i,
      name: route.name ?? "",
      previousGroup: route.group ?? null,
    };
  },
  apply(id: number, group: string): void {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, id);
    if (!route) throw new Error(`Route ${id} not found.`);
    route.group = group;
    if (typeof document !== "undefined") {
      const groupEl = document.getElementById(group);
      const routeEl = document.getElementById(`route${id}`);
      if (groupEl && routeEl) {
        groupEl.appendChild(routeEl);
      }
    }
  },
};

export function createSetRouteGroupTool(
  runtime: RouteGroupRuntime = defaultRouteGroupRuntime,
): Tool {
  return {
    name: "set_route_group",
    description: `Reclassify a route between ${ROUTE_GROUPS.join(" / ")} — same side-effect as the Routes Editor group dropdown. Writes route.group and reparents the #route{i} SVG path under the new group element. Accepts canonical values (roads, trails, searoutes) and common aliases (road, trail, sea lanes, sea-routes, etc.). Matches route by numeric route.i or case-insensitive current name; removed routes are skipped.`,
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: ["integer", "string"],
          description:
            "Numeric route id (matches route.i, not array index) or current case-insensitive name.",
        },
        group: {
          type: "string",
          description: `Canonical: ${ROUTE_GROUPS.join(", ")}. Aliases like "road", "trail", "sea lanes" accepted.`,
        },
      },
      required: ["route", "group"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        route?: unknown;
        group?: unknown;
      };

      const refResult = parseEntityRef(input.route, "route");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.group !== "string" || !input.group.trim()) {
        return errorResult("group must be a non-empty string.", {
          supported: [...ROUTE_GROUPS],
        });
      }
      const resolved = resolveRouteGroup(input.group);
      if (!resolved) {
        return errorResult(`Unknown group: ${JSON.stringify(input.group)}.`, {
          supported: [...ROUTE_GROUPS],
        });
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No route found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.apply(current.i, resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousGroup: current.previousGroup,
        group: resolved,
      });
    },
  };
}

export const setRouteGroupTool = createSetRouteGroupTool();
