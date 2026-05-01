import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRouteByRef } from "./rename-route";

export type MergeCase = "tail-head" | "head-tail" | "head-head" | "tail-tail";

export interface JoinRoutesApplyArgs {
  route: RawRoute;
  other: RawRoute;
  mergedPoints: number[][];
  mergeCase: MergeCase;
}

export interface JoinRoutesRuntime {
  find(id: number): RawRoute | null;
  apply(args: JoinRoutesApplyArgs): void;
}

interface RoutePackLike {
  routes?: RawRoute[];
  cells?: {
    routes?: Record<number, Record<number, number>>;
  };
}

interface RoutesModule {
  remove?: (route: RawRoute) => void;
}

function coerceRoutePoints(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is number[] => Array.isArray(p));
}

function getEndpointCellId(
  points: number[][],
  which: "head" | "tail",
): number | null {
  if (points.length === 0) return null;
  const point = which === "head" ? points[0] : points[points.length - 1];
  if (!Array.isArray(point)) return null;
  const cellId = point[2];
  if (typeof cellId !== "number" || !Number.isInteger(cellId)) return null;
  return cellId;
}

export function determineMergeCase(
  routePoints: number[][],
  otherPoints: number[][],
): MergeCase | null {
  if (routePoints.length === 0 || otherPoints.length === 0) return null;
  const routeHead = getEndpointCellId(routePoints, "head");
  const routeTail = getEndpointCellId(routePoints, "tail");
  const otherHead = getEndpointCellId(otherPoints, "head");
  const otherTail = getEndpointCellId(otherPoints, "tail");
  if (routeTail !== null && routeTail === otherHead) return "tail-head";
  if (routeHead !== null && routeHead === otherTail) return "head-tail";
  if (routeHead !== null && routeHead === otherHead) return "head-head";
  if (routeTail !== null && routeTail === otherTail) return "tail-tail";
  return null;
}

export function computeMergedPoints(
  routePoints: number[][],
  otherPoints: number[][],
  mergeCase: MergeCase,
): number[][] {
  switch (mergeCase) {
    case "tail-head":
      return [...routePoints, ...otherPoints.slice(1)];
    case "head-tail":
      return [...otherPoints, ...routePoints.slice(1)];
    case "head-head":
      return [...[...routePoints].reverse(), ...otherPoints.slice(1)];
    case "tail-tail":
      return [...routePoints, ...[...otherPoints].reverse().slice(1)];
  }
}

function addConnection(
  cellRoutes: Record<number, Record<number, number>>,
  from: number,
  to: number,
  routeId: number,
): void {
  if (!cellRoutes[from]) cellRoutes[from] = {};
  cellRoutes[from][to] = routeId;
  if (!cellRoutes[to]) cellRoutes[to] = {};
  cellRoutes[to][from] = routeId;
}

export const defaultJoinRoutesRuntime: JoinRoutesRuntime = {
  find(id) {
    return findRouteByRef(getPack<RoutePackLike>()?.routes, id);
  },
  apply({ route, other, mergedPoints, mergeCase: _mergeCase }) {
    const pack = getPack<RoutePackLike>();
    if (!Array.isArray(pack?.routes)) {
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
    if (typeof routesModule?.remove !== "function") {
      throw new Error(
        "Routes.remove is not available; the map hasn't finished loading.",
      );
    }

    // mutate in place — preserve route object identity
    route.points = mergedPoints;

    for (let i = 0; i < mergedPoints.length - 1; i++) {
      const fromPoint = mergedPoints[i];
      const toPoint = mergedPoints[i + 1];
      const from = fromPoint?.[2];
      const to = toPoint?.[2];
      if (typeof from === "number" && typeof to === "number") {
        addConnection(cellRoutes, from, to, route.i);
      }
    }

    routesModule.remove(other);

    const redraw = getGlobal<(r: RawRoute) => void>("redrawRoute");
    if (typeof redraw === "function") {
      try {
        redraw(route);
      } catch {
        // best-effort: data mutation already happened
      }
    }
  },
};

function parseRouteId(
  value: unknown,
  fieldName: string,
): { ok: true; id: number } | { ok: false; error: string } {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: `${fieldName} must be a non-negative integer id.`,
    };
  }
  return { ok: true, id: value };
}

export function createJoinRoutesTool(
  runtime: JoinRoutesRuntime = defaultJoinRoutesRuntime,
): Tool {
  return {
    name: "join_routes",
    description:
      'Merge two routes that share an endpoint cell into a single surviving route — same side-effect as the route editor\'s "Join" dialog (routes-editor.js → joinRoutes). The first route (`route`) survives and has its `points` extended; the second route (`other`) is removed via Routes.remove. The four endpoint cases are tried in legacy order: tail-head, head-tail, head-head, tail-tail. For head-head, the surviving route is reversed before appending; for tail-tail, the joined route is reversed before appending. The shared endpoint point is dedupped (point_count = previous + other - 1). pack.cells.routes is updated bidirectionally for the merged path. Unlike the legacy code, this tool errors out if no endpoint is shared rather than silently doing nothing. Result includes `merge_case` so callers can confirm which case applied.',
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: "integer",
          minimum: 0,
          description:
            "Route id (the SURVIVING route — its points are extended).",
        },
        other: {
          type: "integer",
          minimum: 0,
          description:
            "Route id (the JOINED route — its points are merged in and the route is removed).",
        },
      },
      required: ["route", "other"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { route?: unknown; other?: unknown };

      const routeParsed = parseRouteId(input.route, "route");
      if (!routeParsed.ok) return errorResult(routeParsed.error);
      const otherParsed = parseRouteId(input.other, "other");
      if (!otherParsed.ok) return errorResult(otherParsed.error);

      const routeId = routeParsed.id;
      const otherId = otherParsed.id;

      if (routeId === otherId) {
        return errorResult("route and other must be different route ids.");
      }

      const routeObj = runtime.find(routeId);
      if (!routeObj) return errorResult(`Route ${routeId} not found.`);
      const otherObj = runtime.find(otherId);
      if (!otherObj) return errorResult(`Route ${otherId} not found.`);

      const routePoints = coerceRoutePoints(routeObj.points);
      const otherPoints = coerceRoutePoints(otherObj.points);

      const mergeCase = determineMergeCase(routePoints, otherPoints);
      if (!mergeCase) {
        return errorResult(
          `Routes ${routeId} and ${otherId} do not share an endpoint cell. Cannot join.`,
        );
      }

      const mergedPoints = computeMergedPoints(
        routePoints,
        otherPoints,
        mergeCase,
      );

      const previousPointCount = routePoints.length;
      const previousName = routeObj.name ?? "";
      const joinedName = otherObj.name ?? "";

      try {
        runtime.apply({
          route: routeObj,
          other: otherObj,
          mergedPoints,
          mergeCase,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        route: {
          i: routeId,
          name: previousName,
          previous_point_count: previousPointCount,
          point_count: mergedPoints.length,
        },
        joined_route: {
          i: otherId,
          name: joinedName,
          removed: true,
        },
        merge_case: mergeCase,
      });
    },
  };
}

export const joinRoutesTool = createJoinRoutesTool();
