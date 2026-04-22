import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRouteByRef } from "./rename-route";

export interface RemoveRouteRef {
  i: number;
  name: string;
}

export interface RouteRemovalRuntime {
  find(ref: number | string): RemoveRouteRef | null;
  remove(id: number): void;
}

interface RoutePackLike {
  routes?: RawRoute[];
}

interface RoutesModule {
  remove?: (route: RawRoute) => void;
}

export const defaultRouteRemovalRuntime: RouteRemovalRuntime = {
  find(ref) {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, ref);
    if (!route) return null;
    return { i: route.i, name: route.name ?? "" };
  },
  remove(id: number): void {
    const routesModule = getGlobal<RoutesModule>("Routes");
    if (typeof routesModule?.remove !== "function") {
      throw new Error(
        "Routes.remove is not available yet; wait for the map to finish loading.",
      );
    }
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, id);
    if (!route) {
      throw new Error(`Route ${id} not found.`);
    }
    routesModule.remove(route);
  },
};

export function createRemoveRouteTool(
  runtime: RouteRemovalRuntime = defaultRouteRemovalRuntime,
): Tool {
  return {
    name: "remove_route",
    description:
      "Delete a route — delegates to the generator's Routes.remove() so the cell adjacency map (pack.cells.routes), pack.routes, and the #route{i} SVG element are all cleaned up together. Matches by numeric route.i (non-contiguous ids) or case-insensitive current name; removed routes are skipped. The UI's confirm dialog is skipped since tools run non-interactively.",
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: ["integer", "string"],
          description:
            "Numeric route id (matches route.i, not array index) or current case-insensitive name.",
        },
      },
      required: ["route"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { route?: unknown };

      const refResult = parseEntityRef(input.route, "route");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No route found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.remove(current.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ i: current.i, name: current.name });
    },
  };
}

export const removeRouteTool = createRemoveRouteTool();
