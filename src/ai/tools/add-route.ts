import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  ROUTE_GROUPS,
  type RouteGroup,
  resolveRouteGroup,
} from "./list-routes";

export interface AddRouteInput {
  cells: number[];
  group: RouteGroup;
  name?: string;
  feature?: number;
}

export interface NewRoute {
  i: number;
  group: RouteGroup;
  feature: number;
  cells: number[];
  points: [number, number, number][];
  name?: string;
}

export type ValidateCellsResult = { ok: true } | { ok: false; error: string };

export interface AddRouteRuntime {
  validateCells(cells: number[]): ValidateCellsResult;
  add(input: AddRouteInput): NewRoute;
}

interface AddRoutePackLike {
  routes?: RawRoute[];
  cells?: {
    i?: ArrayLike<unknown>;
    p?: ArrayLike<[number, number] | number[]>;
    f?: ArrayLike<number>;
    routes?: Record<number, Record<number, number>>;
  };
}

interface RoutesModule {
  getNextId?: () => number;
}

function computeNextRouteId(routes: RawRoute[]): number {
  if (routes.length === 0) return 0;
  let max = -1;
  for (const r of routes) {
    if (r && typeof r.i === "number" && r.i > max) max = r.i;
  }
  return max + 1;
}

export const defaultAddRouteRuntime: AddRouteRuntime = {
  validateCells(cells: number[]): ValidateCellsResult {
    const pack = getPack<AddRoutePackLike>();
    const cellIds = pack?.cells?.i;
    if (cellIds && typeof cellIds.length === "number") {
      const max = cellIds.length;
      for (const c of cells) {
        if (c >= max) {
          return {
            ok: false,
            error: `Cell index ${c} is out of range (pack.cells has ${max} cells).`,
          };
        }
      }
    }
    return { ok: true };
  },
  add(input: AddRouteInput): NewRoute {
    const pack = getPack<AddRoutePackLike>();
    const routes = pack?.routes;
    if (!Array.isArray(routes)) {
      throw new Error("pack.routes is not available.");
    }

    const cellsArr = pack?.cells?.p;
    const points: [number, number, number][] = input.cells.map((cellId) => {
      const p = cellsArr?.[cellId];
      const x = Array.isArray(p) && typeof p[0] === "number" ? p[0] : 0;
      const y = Array.isArray(p) && typeof p[1] === "number" ? p[1] : 0;
      return [x, y, cellId];
    });

    let feature: number;
    if (typeof input.feature === "number") {
      feature = input.feature;
    } else {
      const featuresArr = pack?.cells?.f;
      const firstCell = input.cells[0];
      const val = featuresArr?.[firstCell];
      feature = typeof val === "number" ? val : 0;
    }

    const routesModule = getGlobal<RoutesModule>("Routes");
    let i: number;
    if (typeof routesModule?.getNextId === "function") {
      try {
        i = routesModule.getNextId();
      } catch {
        i = computeNextRouteId(routes);
      }
    } else {
      i = computeNextRouteId(routes);
    }
    if (routes.some((r) => r?.i === i)) {
      throw new Error(
        `Route id ${i} already exists (pack.routes inconsistent).`,
      );
    }

    const route: RawRoute = {
      i,
      group: input.group,
      feature,
      points,
    };
    if (input.name !== undefined) {
      route.name = input.name;
    }
    routes.push(route);

    // mirror routes-creator.js: update pack.cells.routes adjacency map
    const cellRoutes = pack?.cells?.routes;
    if (cellRoutes && typeof cellRoutes === "object") {
      for (let k = 0; k < points.length - 1; k++) {
        const from = points[k][2];
        const to = points[k + 1][2];
        if (!cellRoutes[from]) cellRoutes[from] = {};
        cellRoutes[from][to] = i;
        if (!cellRoutes[to]) cellRoutes[to] = {};
        cellRoutes[to][from] = i;
      }
    }

    const draw = getGlobal<() => void>("drawRoutes");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: the data mutation already happened.
      }
    }

    return {
      i,
      group: input.group,
      feature,
      cells: input.cells,
      points,
      ...(input.name !== undefined ? { name: input.name } : {}),
    };
  },
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function createAddRouteTool(
  runtime: AddRouteRuntime = defaultAddRouteRuntime,
): Tool {
  return {
    name: "add_route",
    description: `Create a new route in pack.routes — same side-effect as completing the Routes Creator dialog (routes-creator.js → completeCreation). Accepts \`cells\` (ordered cell ids, ≥ 2, forming the path) and \`group\` (canonical: ${ROUTE_GROUPS.join(", ")}; aliases like "road" / "trail" / "sea lanes" accepted). Optional \`name\` (trimmed; defaults to unnamed) and \`feature\` (landmass/ocean id; defaults to pack.cells.f[cells[0]]). The tool derives point triples from pack.cells.p (cell centroids), assigns a fresh id via Routes.getNextId (or max(route.i)+1), pushes onto pack.routes, updates the pack.cells.routes adjacency map bidirectionally (so Routes.areConnected / hasRoad see the new route), and best-effort calls drawRoutes() to render. Follow up with rename_route / set_route_lock to customize.`,
    input_schema: {
      type: "object",
      properties: {
        cells: {
          type: "array",
          items: { type: "integer", minimum: 0 },
          minItems: 2,
          description:
            "Ordered list of cell ids (≥ 2) forming the route's path. Each must be a valid cell id in pack.cells; no duplicates allowed.",
        },
        group: {
          type: "string",
          description: `Canonical: ${ROUTE_GROUPS.join(", ")}. Aliases like "road", "trail", "sea lanes" accepted.`,
        },
        name: {
          type: "string",
          description: "Optional route name. Trimmed. Omitted if not provided.",
        },
        feature: {
          type: "integer",
          minimum: 0,
          description:
            "Optional feature id (landmass for land routes, ocean/sea feature for sea routes). Defaults to pack.cells.f[cells[0]].",
        },
      },
      required: ["cells", "group"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        cells?: unknown;
        group?: unknown;
        name?: unknown;
        feature?: unknown;
      };

      if (!Array.isArray(input.cells)) {
        return errorResult("cells must be an array of cell indices.");
      }
      if (input.cells.length < 2) {
        return errorResult(
          "cells must include at least 2 cell indices forming the route's path.",
        );
      }
      for (const v of input.cells) {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
          return errorResult(
            "cells must contain only non-negative integer cell indices.",
          );
        }
      }
      const cells = input.cells as number[];

      const seen = new Set<number>();
      for (const c of cells) {
        if (seen.has(c)) {
          return errorResult(
            `cells must not contain duplicates (${c} appears more than once).`,
          );
        }
        seen.add(c);
      }

      if (!isNonEmptyString(input.group)) {
        return errorResult("group must be a non-empty string.", {
          supported: [...ROUTE_GROUPS],
        });
      }
      const resolvedGroup = resolveRouteGroup(input.group);
      if (!resolvedGroup) {
        return errorResult(`Unknown group: ${JSON.stringify(input.group)}.`, {
          supported: [...ROUTE_GROUPS],
        });
      }

      let name: string | undefined;
      if (input.name !== undefined && input.name !== null) {
        if (!isNonEmptyString(input.name)) {
          return errorResult("name, if provided, must be a non-empty string.");
        }
        name = input.name.trim();
      }

      let feature: number | undefined;
      if (input.feature !== undefined && input.feature !== null) {
        if (
          typeof input.feature !== "number" ||
          !Number.isInteger(input.feature) ||
          input.feature < 0
        ) {
          return errorResult(
            "feature, if provided, must be a non-negative integer.",
          );
        }
        feature = input.feature;
      }

      const cellCheck = runtime.validateCells(cells);
      if (!cellCheck.ok) {
        return errorResult(cellCheck.error);
      }

      const addInput: AddRouteInput = {
        cells,
        group: resolvedGroup,
        ...(name !== undefined ? { name } : {}),
        ...(feature !== undefined ? { feature } : {}),
      };

      try {
        const created = runtime.add(addInput);
        return okResult({
          i: created.i,
          group: created.group,
          feature: created.feature,
          cells: created.cells,
          points: created.points,
          ...(created.name !== undefined ? { name: created.name } : {}),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addRouteTool = createAddRouteTool();
