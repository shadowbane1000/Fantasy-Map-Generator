import { errorResult, getPack, okResult, type RawMarker } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface FindNearestMarkerHit {
  i: number;
  type: string | null;
  icon: string | null;
  x: number;
  y: number;
  distance: number;
}

export type FindNearestMarkerQuery =
  | { kind: "coords"; x: number; y: number; type: string | null }
  | { kind: "cell"; cell: number; type: string | null };

export type FindNearestMarkerOutcome =
  | FindNearestMarkerHit
  | {
      i: null;
      type: null;
      icon: null;
      x: null;
      y: null;
      distance: null;
    };

export type FindNearestMarkerResult =
  | FindNearestMarkerOutcome
  | "not-ready"
  | "out-of-bounds"
  | "no-cell-point";

interface PackLike {
  markers?: RawMarker[];
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}

function resolveQueryPoint(
  pack: PackLike,
  query: FindNearestMarkerQuery,
): [number, number] | "out-of-bounds" | "no-cell-point" {
  if (query.kind === "coords") return [query.x, query.y];
  const cellsIndex = pack.cells?.i;
  if (!cellsIndex || query.cell < 0 || query.cell >= cellsIndex.length)
    return "out-of-bounds";
  const point = pack.cells?.p?.[query.cell];
  if (!Array.isArray(point)) return "no-cell-point";
  const [px, py] = point;
  if (typeof px !== "number" || typeof py !== "number") return "no-cell-point";
  return [px, py];
}

export function findNearestMarkerInPack(
  pack: PackLike | undefined,
  query: FindNearestMarkerQuery,
): FindNearestMarkerResult {
  if (!pack || !pack.markers) return "not-ready";
  const point = resolveQueryPoint(pack, query);
  if (point === "out-of-bounds") return "out-of-bounds";
  if (point === "no-cell-point") return "no-cell-point";
  const [qx, qy] = point;

  const typeFilter = query.type;

  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let k = 0; k < pack.markers.length; k++) {
    const m = pack.markers[k];
    if (!m) continue;
    if (m.removed) continue;
    if (typeFilter !== null) {
      if (typeof m.type !== "string") continue;
      if (m.type.toLowerCase() !== typeFilter) continue;
    }
    const mx = m.x;
    const my = m.y;
    if (typeof mx !== "number" || typeof my !== "number") continue;
    const dx = mx - qx;
    const dy = my - qy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = k;
    }
  }

  if (bestIdx < 0) {
    return {
      i: null,
      type: null,
      icon: null,
      x: null,
      y: null,
      distance: null,
    };
  }
  const winner = pack.markers[bestIdx];
  return {
    i: winner.i,
    type: typeof winner.type === "string" ? winner.type : null,
    icon: typeof winner.icon === "string" ? winner.icon : null,
    x: winner.x as number,
    y: winner.y as number,
    distance: bestDist,
  };
}

export interface FindNearestMarkerRuntime {
  findNearest(query: FindNearestMarkerQuery): FindNearestMarkerResult;
}

export const defaultFindNearestMarkerRuntime: FindNearestMarkerRuntime = {
  findNearest(query) {
    return findNearestMarkerInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindNearestMarkerQuery;
  error?: string;
}

function parseInput(input: unknown): ParsedInput {
  const args = (input ?? {}) as {
    x?: unknown;
    y?: unknown;
    cell?: unknown;
    type?: unknown;
  };
  const hasX = args.x !== undefined && args.x !== null;
  const hasY = args.y !== undefined && args.y !== null;
  const hasCell = args.cell !== undefined && args.cell !== null;

  if (!hasX && !hasY && !hasCell) {
    return { error: "Provide either (x, y) coordinates or a cell id." };
  }
  if ((hasX || hasY) && hasCell) {
    return { error: "Provide either (x, y) or cell, not both." };
  }

  let typeFilter: string | null = null;
  if (args.type !== undefined && args.type !== null) {
    if (typeof args.type !== "string" || !args.type.trim()) {
      return { error: "type must be a non-empty string." };
    }
    typeFilter = args.type.trim().toLowerCase();
  }

  if (hasCell) {
    if (
      typeof args.cell !== "number" ||
      !Number.isInteger(args.cell) ||
      args.cell < 0
    ) {
      return { error: "cell must be a non-negative integer." };
    }
    return { query: { kind: "cell", cell: args.cell, type: typeFilter } };
  }
  if (!hasX || !hasY) {
    return { error: "x and y must both be provided." };
  }
  if (
    typeof args.x !== "number" ||
    typeof args.y !== "number" ||
    !Number.isFinite(args.x) ||
    !Number.isFinite(args.y)
  ) {
    return { error: "x and y must be finite numbers." };
  }
  return {
    query: { kind: "coords", x: args.x, y: args.y, type: typeFilter },
  };
}

export function createFindNearestMarkerTool(
  runtime: FindNearestMarkerRuntime = defaultFindNearestMarkerRuntime,
): Tool {
  return {
    name: "find_nearest_marker",
    description:
      "Find the nearest non-removed marker (point of interest — castle, battle site, mine, volcano, shipwreck, etc.) to a point. Accepts either a coordinate pair (`x` + `y`, both finite numbers in map / SVG space) or a packed cell id (`cell`, integer — the tool reads `pack.cells.p[cell]` as the query point); the two forms are mutually exclusive. Optional `type` (non-empty string) filters `pack.markers` by case-insensitive exact match of `marker.type` (e.g. 'castle', 'battlefield'). Scans `pack.markers` linearly, skipping any `removed: true` entries and any whose `type` doesn't match the filter, and returns the one with the smallest Euclidean distance as `{ ok, i, type, icon, x, y, distance }`. When no marker matches (empty list, all removed, or type filter excluded everything), returns `{ ok: true, i: null, type: null, icon: null, x: null, y: null, distance: null }` so callers can distinguish \"no match\" from an error. Errors on missing map, out-of-bounds `cell`, a `cell` with no coordinates in `pack.cells.p`, both forms supplied at once, neither supplied, non-finite `x` / `y`, or an empty-string / non-string `type`. Useful as a first step before `set_marker_type`, `set_marker_icon`, `set_marker_colors`, `set_marker_pin`, `move_marker`, `remove_marker`, or any other marker-targeted action when the AI only knows a region / cell of interest. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        x: {
          type: "number",
          description:
            "Horizontal map coordinate of the query point. Required together with `y`; mutually exclusive with `cell`.",
        },
        y: {
          type: "number",
          description:
            "Vertical map coordinate of the query point. Required together with `x`; mutually exclusive with `cell`.",
        },
        cell: {
          type: "integer",
          minimum: 0,
          description:
            "Packed-grid cell index whose centroid (`pack.cells.p[cell]`) is the query point. Mutually exclusive with `x` / `y`.",
        },
        type: {
          type: "string",
          description:
            "Optional marker type filter (e.g. 'castle', 'battlefield'). Case-insensitive exact match against `marker.type`.",
        },
      },
    },
    execute(input: unknown): ToolResult {
      const parsed = parseInput(input);
      if (parsed.error) return errorResult(parsed.error);
      const result = runtime.findNearest(
        parsed.query as FindNearestMarkerQuery,
      );
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "out-of-bounds") {
        const cell = (parsed.query as { cell?: number }).cell;
        return errorResult(`cell ${cell} is out of bounds.`);
      }
      if (result === "no-cell-point") {
        const cell = (parsed.query as { cell?: number }).cell;
        return errorResult(`cell ${cell} has no coordinates.`);
      }
      return okResult({ ...result });
    },
  };
}

export const findNearestMarkerTool = createFindNearestMarkerTool();
