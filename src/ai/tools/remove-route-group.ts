import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Hard-coded in `public/modules/ui/route-group-editor.js` — the three
 * canonical groups whose `<g>` containers must remain in the DOM even
 * when emptied (the editor's standard tabs depend on them). A custom
 * group like `route-pilgrim` is removed wholesale.
 */
export const DEFAULT_ROUTE_GROUPS = ["roads", "trails", "searoutes"] as const;

export interface RemoveRouteGroupRuntime {
  /** True when an SVG `<g id="${group}">` exists under #routes. */
  groupExists(group: string): boolean;
  /** The active routes whose `route.group === group`. */
  listRoutesInGroup(group: string): RawRoute[];
  /** Same contract as `Routes.remove` from the legacy module. */
  removeRoute(route: RawRoute): void;
  /** Removes the `<g id="${group}">` element from the routes selection. */
  removeGroupElement(group: string): void;
}

interface RoutePackLike {
  routes?: RawRoute[];
}

interface RoutesModule {
  remove?: (route: RawRoute) => void;
}

interface MinimalD3Selection {
  empty?: () => boolean;
  size?: () => number;
  remove?: () => void;
}

interface RoutesSvgSelection {
  select: (selector: string) => MinimalD3Selection;
}

function selectionIsPopulated(sel: MinimalD3Selection | undefined): boolean {
  if (!sel) return false;
  if (typeof sel.empty === "function") return !sel.empty();
  if (typeof sel.size === "function") return sel.size() > 0;
  return false;
}

export const defaultRemoveRouteGroupRuntime: RemoveRouteGroupRuntime = {
  groupExists(group) {
    const routesSel = getGlobal<RoutesSvgSelection>("routes");
    if (routesSel && typeof routesSel.select === "function") {
      const sel = routesSel.select(`#${group}`);
      if (selectionIsPopulated(sel)) return true;
    }
    if (typeof document !== "undefined") {
      return document.getElementById(group) !== null;
    }
    return false;
  },
  listRoutesInGroup(group) {
    const routes = getPack<RoutePackLike>()?.routes;
    if (!Array.isArray(routes)) return [];
    return routes.filter(
      (r): r is RawRoute => !!r && !r.removed && r.group === group,
    );
  },
  removeRoute(route) {
    const routesModule = getGlobal<RoutesModule>("Routes");
    if (typeof routesModule?.remove !== "function") {
      throw new Error(
        "Routes.remove is not available yet; wait for the map to finish loading.",
      );
    }
    routesModule.remove(route);
  },
  removeGroupElement(group) {
    const routesSel = getGlobal<RoutesSvgSelection>("routes");
    if (routesSel && typeof routesSel.select === "function") {
      const sel = routesSel.select(`#${group}`);
      if (typeof sel?.remove === "function") {
        sel.remove();
        return;
      }
    }
    if (typeof document !== "undefined") {
      document.getElementById(group)?.remove();
    }
  },
};

export function createRemoveRouteGroupTool(
  runtime: RemoveRouteGroupRuntime = defaultRemoveRouteGroupRuntime,
): Tool {
  return {
    name: "remove_route_group",
    description: `Delete a route group and every route inside it — same side-effect as the Route Groups Editor trash icon. Iterates pack.routes for entries with route.group === <group> and feeds each to the legacy Routes.remove() (so pack.cells.routes adjacency, pack.routes, and #route{i} SVG nodes are cleaned up together). For groups outside the default list (${DEFAULT_ROUTE_GROUPS.join(", ")}), additionally removes the <g id="${"{group}"}"> container from the routes SVG selection. Default groups keep their container so the editor's standard tabs stay populated. Errors when no <g> with that id exists under #routes; the UI's confirm dialog is skipped since tools run non-interactively.`,
    input_schema: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description:
            'Route group id, e.g. "roads", "trails", "searoutes", or a custom group like "route-pilgrim".',
        },
      },
      required: ["group"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { group?: unknown };

      if (typeof input.group !== "string") {
        return errorResult("group must be a string.");
      }
      const group = input.group.trim();
      if (!group) {
        return errorResult("group must be a non-empty string.");
      }

      if (!runtime.groupExists(group)) {
        return errorResult(
          `No route group element found with id ${JSON.stringify(group)}.`,
        );
      }

      const matching = runtime.listRoutesInGroup(group);

      try {
        for (const route of matching) {
          runtime.removeRoute(route);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const isDefault = (DEFAULT_ROUTE_GROUPS as readonly string[]).includes(
        group,
      );
      let svgRemoved = false;
      if (!isDefault) {
        try {
          runtime.removeGroupElement(group);
          svgRemoved = true;
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      }

      return okResult({
        group,
        removed_count: matching.length,
        svg_removed: svgRemoved,
      });
    },
  };
}

export const removeRouteGroupTool = createRemoveRouteGroupTool();
