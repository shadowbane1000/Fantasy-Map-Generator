import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRouteByRef } from "./rename-route";

export interface RegenerateRouteNameRef {
  i: number;
  name: string;
  group: string;
  points: number[][];
}

export interface RegenerateRouteNameRuntime {
  find(ref: number | string): RegenerateRouteNameRef | null;
  generate(ref: RegenerateRouteNameRef): string;
  apply(i: number, name: string): void;
}

interface RoutePackLike {
  routes?: RawRoute[];
}

interface RoutesModuleLike {
  generateName?: (route: { group: string; points: number[][] }) => string;
}

function coerceRoutePoints(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is number[] => Array.isArray(p));
}

export const defaultRegenerateRouteNameRuntime: RegenerateRouteNameRuntime = {
  find(ref) {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, ref);
    if (!route) return null;
    return {
      i: route.i,
      name: route.name ?? "",
      group: route.group ?? "",
      points: coerceRoutePoints(route.points),
    };
  },
  generate(ref) {
    const routes = getGlobal<RoutesModuleLike>("Routes");
    if (!routes) {
      throw new Error(
        "Routes is not available; the map hasn't finished loading.",
      );
    }
    if (typeof routes.generateName !== "function") {
      throw new Error("Routes.generateName is not available.");
    }
    return routes.generateName({ group: ref.group, points: ref.points });
  },
  apply(i, name) {
    const route = findRouteByRef(getPack<RoutePackLike>()?.routes, i);
    if (!route) throw new Error(`Route ${i} not found.`);
    route.name = name;
  },
};

// Routes start at i=0 (no placeholder slot), so this validator accepts 0
// — unlike the shared parseEntityRef which requires `> 0`.
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

export function createRegenerateRouteNameTool(
  runtime: RegenerateRouteNameRuntime = defaultRegenerateRouteNameRuntime,
): Tool {
  return {
    name: "regenerate_route_name",
    description:
      'Re-roll a route\'s procedural name by calling Routes.generateName({ group, points }) — same side-effect as the Routes Editor\'s "Generate name" button. Identifies the route by numeric id (matches route.i — note ids start at 0, so 0 is a real route) or current case-insensitive name; removed routes are skipped. Writes pack.routes[k].name in place. Route names live in the Routes Overview / notes, not on-map, so no SVG redraw is needed. The generator may legitimately return "Unnamed route" or "Unnamed route segment" for short paths — those values pass through.',
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: ["integer", "string"],
          description:
            "Numeric route id (matches route.i — note ids start at 0, so 0 is a real route) or current case-insensitive name. Removed routes are skipped.",
        },
      },
      required: ["route"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { route?: unknown };

      const parsed = parseRouteRef(input.route);
      if (!parsed.ok) return errorResult(parsed.error);

      const target = runtime.find(parsed.ref);
      if (!target) {
        return errorResult(
          `No route found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }

      let generated: string;
      try {
        generated = runtime.generate(target);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (typeof generated !== "string" || !generated.trim()) {
        return errorResult("Name generator returned an empty/invalid name.");
      }
      const newName = generated.trim();

      try {
        runtime.apply(target.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: target.i,
        previousName: target.name,
        name: newName,
      });
    },
  };
}

export const regenerateRouteNameTool = createRegenerateRouteNameTool();
