import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RouteLike {
  i: number;
  name?: string;
  group?: string;
  points?: number[][];
  lock?: boolean;
  removed?: boolean;
}

export interface RegenerateAllRouteNamesRuntime {
  getRoutes(): RouteLike[];
  generateName(route: RouteLike): string;
}

interface RoutesModuleLike {
  generateName?: (route: { group: string; points: number[][] }) => string;
}

function coerceRoutePoints(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is number[] => Array.isArray(p));
}

export const defaultRegenerateAllRouteNamesRuntime: RegenerateAllRouteNamesRuntime =
  {
    getRoutes() {
      const routes = getPackCollection<RawRoute>("routes");
      if (!Array.isArray(routes)) {
        throw new Error("pack.routes is not available.");
      }
      const refs: RouteLike[] = [];
      for (const route of routes) {
        if (!route) continue;
        refs.push({
          i: route.i,
          name: route.name ?? "",
          group: route.group ?? "",
          points: coerceRoutePoints(route.points),
          lock: route.lock,
          removed: route.removed,
        });
      }
      return refs;
    },
    generateName(route) {
      const module = getGlobal<RoutesModuleLike>("Routes");
      if (!module) {
        throw new Error(
          "Routes is not available; the map hasn't finished loading.",
        );
      }
      if (typeof module.generateName !== "function") {
        throw new Error("Routes.generateName is not available.");
      }
      return module.generateName({
        group: route.group ?? "",
        points: coerceRoutePoints(route.points),
      });
    },
  };

function applyName(i: number, name: string): void {
  const routes = getPackCollection<RawRoute>("routes");
  if (!Array.isArray(routes)) {
    throw new Error("pack.routes is not available.");
  }
  const route = routes.find((r) => r && r.i === i);
  if (!route) throw new Error(`Route ${i} not found.`);
  route.name = name;
}

export function createRegenerateAllRouteNamesTool(
  runtime: RegenerateAllRouteNamesRuntime = defaultRegenerateAllRouteNamesRuntime,
): Tool {
  return {
    name: "regenerate_all_route_names",
    description: `Bulk-regenerate names for every non-locked route in pack.routes — fills the last gap in the "regenerate all names" tool family (burgs / states / cultures / provinces / rivers / regiments / religions all already have one). Calls Routes.generateName({ group, points }) per route — same algorithm the single-route regenerate_route_name tool uses, applied across the whole map. Writes route.name in place. Routes have no on-map labels (the renderer only emits paths), so no SVG redraw is needed. Locked routes (route.lock=true — set via set_entity_lock) are preserved. Routes can legitimately have no current name (route.name undefined / ""): they receive a fresh generated name just like any other unlocked route. The generator may return "Unnamed route" or "Unnamed route segment" for short paths — those values pass through. Skips index 0 by convention to match the rest of the regenerate-all family. Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      let routes: RouteLike[];
      try {
        routes = runtime.getRoutes();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (routes.length === 0) {
        return errorResult("pack.routes is empty.");
      }

      let total = 0;
      let regenerated = 0;
      let locked = 0;

      for (const route of routes) {
        if (route.i <= 0) continue;
        if (route.removed) continue;
        total++;
        if (route.lock) {
          locked++;
          continue;
        }

        let newName: string;
        try {
          newName = runtime.generateName(route);
        } catch (err) {
          return errorResult(
            `Route ${route.i}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (typeof newName !== "string" || !newName.trim()) {
          return errorResult(
            `Route ${route.i}: name generator returned an empty/invalid name.`,
          );
        }

        try {
          applyName(route.i, newName.trim());
        } catch (err) {
          return errorResult(
            `Route ${route.i}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        regenerated++;
      }

      return okResult({ total, regenerated, locked });
    },
  };
}

export const regenerateAllRouteNamesTool = createRegenerateAllRouteNamesTool();
