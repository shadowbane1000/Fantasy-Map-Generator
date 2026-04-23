import { errorResult, getPack, okResult, type RawBurg } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface FindNearestBurgHit {
  i: number;
  name: string;
  x: number;
  y: number;
  distance: number;
}

export type FindNearestBurgQuery =
  | { kind: "coords"; x: number; y: number }
  | { kind: "cell"; cell: number };

export type FindNearestBurgOutcome =
  | FindNearestBurgHit
  | {
      i: null;
      name: null;
      x: null;
      y: null;
      distance: null;
    };

export type FindNearestBurgResult =
  | FindNearestBurgOutcome
  | "not-ready"
  | "out-of-bounds"
  | "no-cell-point";

interface PackLike {
  burgs?: RawBurg[];
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}

function resolveQueryPoint(
  pack: PackLike,
  query: FindNearestBurgQuery,
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

export function findNearestBurgInPack(
  pack: PackLike | undefined,
  query: FindNearestBurgQuery,
): FindNearestBurgResult {
  if (!pack || !pack.burgs) return "not-ready";
  const point = resolveQueryPoint(pack, query);
  if (point === "out-of-bounds") return "out-of-bounds";
  if (point === "no-cell-point") return "no-cell-point";
  const [qx, qy] = point;

  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    const bx = b.x;
    const by = b.y;
    if (typeof bx !== "number" || typeof by !== "number") continue;
    const dx = bx - qx;
    const dy = by - qy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = k;
    }
  }

  if (bestIdx < 0) {
    return { i: null, name: null, x: null, y: null, distance: null };
  }
  const winner = pack.burgs[bestIdx];
  return {
    i: winner.i,
    name: typeof winner.name === "string" ? winner.name : "",
    x: winner.x as number,
    y: winner.y as number,
    distance: bestDist,
  };
}

export interface FindNearestBurgRuntime {
  findNearest(query: FindNearestBurgQuery): FindNearestBurgResult;
}

export const defaultFindNearestBurgRuntime: FindNearestBurgRuntime = {
  findNearest(query) {
    return findNearestBurgInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindNearestBurgQuery;
  error?: string;
}

function parseInput(input: unknown): ParsedInput {
  const args = (input ?? {}) as {
    x?: unknown;
    y?: unknown;
    cell?: unknown;
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
  if (hasCell) {
    if (
      typeof args.cell !== "number" ||
      !Number.isInteger(args.cell) ||
      args.cell < 0
    ) {
      return { error: "cell must be a non-negative integer." };
    }
    return { query: { kind: "cell", cell: args.cell } };
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
  return { query: { kind: "coords", x: args.x, y: args.y } };
}

export function createFindNearestBurgTool(
  runtime: FindNearestBurgRuntime = defaultFindNearestBurgRuntime,
): Tool {
  return {
    name: "find_nearest_burg",
    description:
      "Find the nearest non-removed burg on the current map. Accepts either a point in SVG/map coordinates (`x` + `y`, both finite numbers) OR a packed cell id (`cell`, integer — the tool reads `pack.cells.p[cell]` for the query point). Scans `pack.burgs` linearly, skipping the index-0 placeholder and any `removed: true` burgs, and returns the one with the smallest Euclidean distance to the query point as `{ ok, i, name, x, y, distance }`. When the map has no active burgs, returns `{ ok: true, i: null, name: null, x: null, y: null, distance: null }` so callers can distinguish \"no match\" from an error. Errors on missing map (`pack`), out-of-bounds `cell`, a `cell` with no coordinates in `pack.cells.p`, both forms supplied at once, neither form supplied, or non-finite `x` / `y`. Useful as a first step before `rename_burg`, `move_burg`, `set_burg_population`, or any other burg-targeted action when the AI only knows a region / cell of interest. Requires an Anthropic API key (see 'Getting an API key' below).",
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
      },
    },
    execute(input: unknown): ToolResult {
      const parsed = parseInput(input);
      if (parsed.error) return errorResult(parsed.error);
      const result = runtime.findNearest(parsed.query as FindNearestBurgQuery);
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

export const findNearestBurgTool = createFindNearestBurgTool();
