import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface SplitRouteRef {
  i: number;
  name: string;
  group: string;
  feature: number;
  points: [number, number, number][];
  removed: boolean;
}

export interface SplitRouteResult {
  newRouteId: number;
  oldPointCount: number;
  newPointCount: number;
  sharedCellId: number;
}

export interface SplitRouteRuntime {
  find(ref: number | string): SplitRouteRef | null;
  split(ref: SplitRouteRef, index: number): SplitRouteResult;
}

interface SplitRoutePackLike {
  routes?: RawRoute[];
  cells?: {
    routes?: Record<number, Record<number, number>>;
  };
}

interface RoutesModule {
  getNextId?: () => number;
  getPath?: (route: RawRoute) => string;
}

interface RoutesD3Selection {
  select?: (selector: string) => {
    append?: (name: string) => {
      attr: (k: string, v: string | number) => unknown;
    };
  };
}

function coercePointTriple(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = raw[0];
  const y = raw[1];
  const c = raw[2];
  if (typeof x !== "number" || typeof y !== "number" || typeof c !== "number") {
    return null;
  }
  return [x, y, c];
}

function coercePointTriples(raw: unknown): [number, number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number, number][] = [];
  for (const p of raw) {
    const t = coercePointTriple(p);
    if (t) out.push(t);
  }
  return out;
}

export function findRouteIncludingRemoved(
  routes: RawRoute[] | undefined,
  ref: number | string,
): RawRoute | null {
  if (!Array.isArray(routes)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return null;
    for (const r of routes) {
      if (r && r.i === ref) return r;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const r of routes) {
    if (!r) continue;
    if ((r.name ?? "").toLowerCase() === needle) return r;
  }
  return null;
}

export const defaultSplitRouteRuntime: SplitRouteRuntime = {
  find(ref) {
    const route = findRouteIncludingRemoved(
      getPack<SplitRoutePackLike>()?.routes,
      ref,
    );
    if (!route) return null;
    return {
      i: route.i,
      name: route.name ?? "",
      group: route.group ?? "",
      feature: typeof route.feature === "number" ? route.feature : 0,
      points: coercePointTriples(route.points),
      removed: !!route.removed,
    };
  },
  split(ref, index) {
    const pack = getPack<SplitRoutePackLike>();
    const routes = pack?.routes;
    if (!Array.isArray(routes)) {
      throw new Error(
        "window.pack.routes is not available; the map hasn't finished loading.",
      );
    }
    const cellRoutes = pack?.cells?.routes;
    if (!cellRoutes || typeof cellRoutes !== "object") {
      throw new Error(
        "window.pack.cells.routes is not available; the map hasn't finished loading.",
      );
    }
    const routesModule = getGlobal<RoutesModule>("Routes");
    if (typeof routesModule?.getNextId !== "function") {
      throw new Error(
        "Routes.getNextId is not available; the map hasn't finished loading.",
      );
    }

    // Re-resolve the live route object so we mutate pack.routes itself.
    const route = findRouteIncludingRemoved(routes, ref.i);
    if (!route) {
      throw new Error(`Route ${ref.i} not found.`);
    }
    const livePoints = Array.isArray(route.points)
      ? (route.points as unknown[])
      : [];

    const oldPoints = livePoints.slice(0, index + 1);
    const newPoints = livePoints.slice(index);

    // In-place mutation: preserve route object identity.
    route.points = oldPoints;

    const newId = routesModule.getNextId();
    const newRoute: RawRoute = {
      i: newId,
      group: route.group,
      feature: route.feature,
      points: newPoints,
    };
    if (route.name !== undefined) {
      newRoute.name = route.name;
    }
    routes.push(newRoute);

    // Mirror addConnection from routes-editor.js for each adjacent
    // pair in newPoints — overwrites the old route.i with newRoute.i
    // for the boundary pair AND every downstream pair.
    for (let k = 0; k < newPoints.length - 1; k++) {
      const a = coercePointTriple(newPoints[k]);
      const b = coercePointTriple(newPoints[k + 1]);
      if (!a || !b) continue;
      const from = a[2];
      const to = b[2];
      if (!cellRoutes[from]) cellRoutes[from] = {};
      cellRoutes[from][to] = newId;
      if (!cellRoutes[to]) cellRoutes[to] = {};
      cellRoutes[to][from] = newId;
    }

    // Best-effort: append a path to the legacy D3 routes selection.
    const routesSelection = getGlobal<RoutesD3Selection>("routes");
    if (routesSelection && typeof routesSelection.select === "function") {
      try {
        const groupSel = routesSelection.select(`#${route.group ?? ""}`);
        const path = groupSel?.append?.("path");
        if (path) {
          const d =
            typeof routesModule.getPath === "function"
              ? routesModule.getPath(newRoute)
              : "";
          path.attr("d", d);
          path.attr("id", `route${newId}`);
        }
      } catch {
        // Data mutation is what matters; rendering is best-effort.
      }
    }

    // Best-effort: trigger a global redraw if available.
    const draw = getGlobal<() => void>("drawRoutes");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort.
      }
    }

    const sharedCellId = (() => {
      const last = oldPoints[oldPoints.length - 1];
      const t = coercePointTriple(last);
      return t ? t[2] : -1;
    })();

    return {
      newRouteId: newId,
      oldPointCount: oldPoints.length,
      newPointCount: newPoints.length,
      sharedCellId,
    };
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

export function createSplitRouteTool(
  runtime: SplitRouteRuntime = defaultSplitRouteRuntime,
): Tool {
  return {
    name: "split_route",
    description:
      "Split one route into two at a control-point index — same side-effect as pressing the Routes Editor's Split button (routes-editor.js → splitRoute). The original route keeps points[0..index] and a NEW route is created with points[index..end] (the split point is duplicated so both routes terminate at the same cell). The new route inherits group, feature, and name from the original; its id comes from Routes.getNextId(). pack.cells.routes adjacency is rewritten so cells downstream of the split now connect via the new route id. Identifies the source route by numeric id (matches route.i — ids start at 0) or current case-insensitive name; removed routes are rejected. Index must be an integer in [1, route.points.length - 2] — endpoints would produce empty routes.",
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: ["integer", "string"],
          description:
            "Route id (matches route.i — note ids start at 0, so 0 is a real route) or case-insensitive current name.",
        },
        index: {
          type: "integer",
          minimum: 1,
          description:
            "Control-point index at which to split. Must be > 0 and < route.points.length - 1.",
        },
      },
      required: ["route", "index"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        route?: unknown;
        index?: unknown;
      };

      const parsed = parseRouteRef(input.route);
      if (!parsed.ok) return errorResult(parsed.error);

      const target = runtime.find(parsed.ref);
      if (!target) {
        return errorResult(`Route ${JSON.stringify(parsed.ref)} not found.`);
      }

      if (target.removed) {
        return errorResult(`Cannot split removed route ${target.i}.`);
      }

      const maxIndex = target.points.length - 2;
      const index = input.index;
      if (
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        index < 1 ||
        index > maxIndex
      ) {
        return errorResult(`index must be an integer in [1, ${maxIndex}].`);
      }

      let result: SplitRouteResult;
      try {
        result = runtime.split(target, index);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const hasName = !!target.name;
      return okResult({
        route: {
          i: target.i,
          ...(hasName ? { name: target.name } : {}),
          previous_point_count: target.points.length,
          point_count: result.oldPointCount,
        },
        new_route: {
          i: result.newRouteId,
          ...(hasName ? { name: target.name } : {}),
          point_count: result.newPointCount,
        },
        split_at_index: index,
      });
    },
  };
}

export const splitRouteTool = createSplitRouteTool();
