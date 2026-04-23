import { errorResult, getPack, okResult, type RawRiver } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface FindNearestRiverHit {
  i: number;
  name: string;
  x: number;
  y: number;
  distance: number;
}

export type FindNearestRiverQuery =
  | { kind: "coords"; x: number; y: number }
  | { kind: "cell"; cell: number };

export type FindNearestRiverOutcome =
  | FindNearestRiverHit
  | {
      i: null;
      name: null;
      x: null;
      y: null;
      distance: null;
    };

export type FindNearestRiverResult =
  | FindNearestRiverOutcome
  | "not-ready"
  | "out-of-bounds"
  | "no-cell-point";

interface PackLike {
  rivers?: RawRiver[];
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}

function resolveQueryPoint(
  pack: PackLike,
  query: FindNearestRiverQuery,
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

function readCellCoords(
  pack: PackLike,
  cell: number | undefined,
): [number, number] | null {
  if (typeof cell !== "number") return null;
  const p = pack.cells?.p?.[cell];
  if (!Array.isArray(p)) return null;
  const [px, py] = p;
  if (typeof px !== "number" || typeof py !== "number") return null;
  return [px, py];
}

export function findNearestRiverInPack(
  pack: PackLike | undefined,
  query: FindNearestRiverQuery,
): FindNearestRiverResult {
  if (!pack || !pack.rivers) return "not-ready";
  const point = resolveQueryPoint(pack, query);
  if (point === "out-of-bounds") return "out-of-bounds";
  if (point === "no-cell-point") return "no-cell-point";
  const [qx, qy] = point;

  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestX = 0;
  let bestY = 0;
  for (let k = 0; k < pack.rivers.length; k++) {
    const r = pack.rivers[k];
    if (!r) continue;
    if (r.i === 0) continue;
    if (r.removed) continue;

    const source = readCellCoords(pack, r.source);
    const mouth = readCellCoords(pack, r.mouth);
    if (!source && !mouth) continue;

    // Pick the closer of source / mouth. Source wins ties (comes first
    // in iteration).
    let riverDist = Number.POSITIVE_INFINITY;
    let riverX = 0;
    let riverY = 0;
    if (source) {
      const dx = source[0] - qx;
      const dy = source[1] - qy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < riverDist) {
        riverDist = d;
        riverX = source[0];
        riverY = source[1];
      }
    }
    if (mouth) {
      const dx = mouth[0] - qx;
      const dy = mouth[1] - qy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < riverDist) {
        riverDist = d;
        riverX = mouth[0];
        riverY = mouth[1];
      }
    }

    if (riverDist < bestDist) {
      bestDist = riverDist;
      bestIdx = k;
      bestX = riverX;
      bestY = riverY;
    }
  }

  if (bestIdx < 0) {
    return { i: null, name: null, x: null, y: null, distance: null };
  }
  const winner = pack.rivers[bestIdx];
  return {
    i: winner.i,
    name: typeof winner.name === "string" ? winner.name : "",
    x: bestX,
    y: bestY,
    distance: bestDist,
  };
}

export interface FindNearestRiverRuntime {
  findNearest(query: FindNearestRiverQuery): FindNearestRiverResult;
}

export const defaultFindNearestRiverRuntime: FindNearestRiverRuntime = {
  findNearest(query) {
    return findNearestRiverInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindNearestRiverQuery;
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

export function createFindNearestRiverTool(
  runtime: FindNearestRiverRuntime = defaultFindNearestRiverRuntime,
): Tool {
  return {
    name: "find_nearest_river",
    description:
      "Find the nearest non-removed river on the current map. Accepts either a point in SVG/map coordinates (`x` + `y`, both finite numbers) OR a packed cell id (`cell`, integer — the tool reads `pack.cells.p[cell]` for the query point). Scans `pack.rivers` linearly, skipping the index-0 placeholder and any `removed: true` rivers, and measures each river by the Euclidean distance from the query point to the closer of its `source` / `mouth` cell centroids (read from `pack.cells.p[cellI]`). This is a deliberate approximation — `river.cells[]` is not always populated after load, so only the two endpoints are considered. Returns the river with the smallest such distance as `{ ok, i, name, x, y, distance }`, where `x` / `y` are the coords of the winning endpoint (source or mouth, whichever was closer). When no river matches (empty `pack.rivers`, all removed, or no river has usable source / mouth coords), returns `{ ok: true, i: null, name: null, x: null, y: null, distance: null }` so callers can distinguish \"no match\" from an error. Errors on missing map, out-of-bounds `cell`, a `cell` with no coordinates in `pack.cells.p`, both forms supplied at once, neither supplied, or non-finite `x` / `y`. Useful as a first step before `get_river_info`, `rename_river`, `set_river_type`, `set_river_width`, `remove_river`, or `regenerate_river_names` when the AI only knows a region / cell of interest. Requires an Anthropic API key (see 'Getting an API key' below).",
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
      const result = runtime.findNearest(parsed.query as FindNearestRiverQuery);
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

export const findNearestRiverTool = createFindNearestRiverTool();
