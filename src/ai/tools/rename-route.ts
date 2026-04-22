import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RouteRenameRef {
  i: number;
  name: string;
}

export interface RouteRenameRuntime {
  find(ref: number | string): RouteRenameRef | null;
  rename(i: number, name: string): void;
}

interface RoutePackLike {
  routes?: RawRoute[];
}

export function findRouteByRef(
  routes: RawRoute[] | undefined,
  ref: number | string,
): RawRoute | null {
  if (!Array.isArray(routes)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return null;
    for (const r of routes) {
      if (r && !r.removed && r.i === ref) return r;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const r of routes) {
    if (!r || r.removed) continue;
    if ((r.name ?? "").toLowerCase() === needle) return r;
  }
  return null;
}

export const defaultRouteRenameRuntime: RouteRenameRuntime = {
  find(ref) {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, ref);
    if (!route) return null;
    return { i: route.i, name: route.name ?? "" };
  },
  rename(i: number, name: string): void {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, i);
    if (!route) throw new Error(`Route ${i} not found.`);
    route.name = name;
  },
};

export function createRenameRouteTool(
  runtime: RouteRenameRuntime = defaultRouteRenameRuntime,
): Tool {
  return {
    name: "rename_route",
    description:
      "Rename a route. Writes pack.routes[k].name — same side-effect as the Routes Editor name field. Routes match by numeric route.i (non-contiguous ids) or case-insensitive current name; removed routes are skipped. The name lives in the Routes Overview and notes, not on-map.",
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: ["integer", "string"],
          description:
            "Numeric route id (matches route.i, not array index) or current case-insensitive name.",
        },
        name: {
          type: "string",
          description: "The new name for the route.",
        },
      },
      required: ["route", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        route?: unknown;
        name?: unknown;
      };

      const refResult = parseEntityRef(input.route, "route");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No route found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const newName = input.name.trim();
      try {
        runtime.rename(current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        name: newName,
      });
    },
  };
}

export const renameRouteTool = createRenameRouteTool();
