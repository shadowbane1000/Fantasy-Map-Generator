import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRouteByRef } from "./rename-route";

interface RoutePackLike {
  routes?: RawRoute[];
}

export interface RouteLockRef {
  i: number;
  name: string;
  previousLocked: boolean;
}

export interface RouteLockRuntime {
  find(ref: number | string): RouteLockRef | null;
  apply(i: number, locked: boolean): void;
}

export const defaultRouteLockRuntime: RouteLockRuntime = {
  find(ref) {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, ref);
    if (!route) return null;
    return {
      i: route.i,
      name: route.name ?? "",
      previousLocked: !!route.lock,
    };
  },
  apply(i, locked) {
    const routes = getPack<RoutePackLike>()?.routes;
    if (!Array.isArray(routes)) {
      throw new Error("pack.routes is not available.");
    }
    const route = findRouteByRef(routes, i);
    if (!route) throw new Error(`Route ${i} not found.`);
    if (locked) {
      (route as RawRoute).lock = true;
    } else {
      delete (route as RawRoute).lock;
    }
  },
};

export function createSetRouteLockTool(
  runtime: RouteLockRuntime = defaultRouteLockRuntime,
): Tool {
  return {
    name: "set_route_lock",
    description:
      "Lock or unlock a route — same side-effect as the lock icon in the Routes Editor / Routes Overview. Locked routes are preserved across regeneration (the generator won't re-route, rename, or prune them). On lock the tool writes `route.lock = true`; on unlock it deletes the key entirely (keeps serialization clean). Idempotent: noop when the route is already in the requested state. Routes match by numeric id or case-insensitive current name.",
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: ["integer", "string"],
          description: "Numeric route id (> 0) or case-insensitive name.",
        },
        locked: {
          type: "boolean",
          description: "true to lock, false to unlock.",
        },
      },
      required: ["route", "locked"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        route?: unknown;
        locked?: unknown;
      };

      const refResult = parseEntityRef(input.route, "route");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.locked !== "boolean") {
        return errorResult("locked must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No route found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousLocked === input.locked) {
        return okResult({
          i: current.i,
          name: current.name,
          locked: input.locked,
          previousLocked: current.previousLocked,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, input.locked);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        locked: input.locked,
        previousLocked: current.previousLocked,
        noop: false,
      });
    },
  };
}

export const setRouteLockTool = createSetRouteLockTool();
