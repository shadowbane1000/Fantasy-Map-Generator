import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_CELLS_IN_RADIUS_LIMIT = 10000;
export const MAX_FIND_CELLS_IN_RADIUS_LIMIT = 100000;

export interface FindCellsInRadiusHit {
  cells: number[];
  count: number;
  center: { x: number; y: number };
}

export type FindCellsInRadiusQuery =
  | { kind: "coords"; x: number; y: number; radius: number; limit: number }
  | { kind: "cell"; cell: number; radius: number; limit: number };

export type FindCellsInRadiusResult =
  | FindCellsInRadiusHit
  | "not-ready"
  | "out-of-bounds"
  | "no-cell-point";

interface PackLike {
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}

function resolveCenterPoint(
  pack: PackLike,
  query: FindCellsInRadiusQuery,
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

/**
 * Pure scanner: collects every cell index in `pack.cells.p` whose
 * centroid lies within `radius` (SVG pixels) of the query point.
 * Uses squared-distance to avoid a per-cell `Math.sqrt`. `count`
 * reports the full unlimited total even when `cells` is truncated
 * by `limit`.
 */
export function findCellsInRadiusInPack(
  pack: PackLike | undefined,
  query: FindCellsInRadiusQuery,
): FindCellsInRadiusResult {
  const points = pack?.cells?.p;
  if (!points) return "not-ready";
  const point = resolveCenterPoint(pack, query);
  if (point === "out-of-bounds") return "out-of-bounds";
  if (point === "no-cell-point") return "no-cell-point";
  const [cx, cy] = point;

  const r = query.radius;
  const r2 = r * r;
  const cap = query.limit > 0 ? query.limit : 0;

  const cells: number[] = [];
  let count = 0;
  const length = points.length;
  for (let i = 0; i < length; i++) {
    const p = points[i];
    if (!Array.isArray(p)) continue;
    const px = p[0];
    const py = p[1];
    if (typeof px !== "number" || typeof py !== "number") continue;
    const dx = px - cx;
    const dy = py - cy;
    if (dx * dx + dy * dy <= r2) {
      count++;
      if (cells.length < cap) cells.push(i);
    }
  }

  return {
    cells,
    count,
    center: { x: cx, y: cy },
  };
}

export interface FindCellsInRadiusRuntime {
  find(query: FindCellsInRadiusQuery): FindCellsInRadiusResult;
}

export const defaultFindCellsInRadiusRuntime: FindCellsInRadiusRuntime = {
  find(query) {
    return findCellsInRadiusInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindCellsInRadiusQuery;
  error?: string;
}

function parseInput(rawInput: unknown): ParsedInput {
  const args = (rawInput ?? {}) as {
    x?: unknown;
    y?: unknown;
    cell?: unknown;
    radius?: unknown;
    limit?: unknown;
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

  if (
    typeof args.radius !== "number" ||
    !Number.isFinite(args.radius) ||
    args.radius < 0
  ) {
    return { error: "radius is required and must be a finite number >= 0." };
  }
  const radius = args.radius;

  let limit: number = DEFAULT_FIND_CELLS_IN_RADIUS_LIMIT;
  if (args.limit !== undefined && args.limit !== null) {
    if (
      typeof args.limit !== "number" ||
      !Number.isInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > MAX_FIND_CELLS_IN_RADIUS_LIMIT
    ) {
      return {
        error: `limit must be an integer in [1, ${MAX_FIND_CELLS_IN_RADIUS_LIMIT}].`,
      };
    }
    limit = args.limit;
  }

  if (hasCell) {
    if (
      typeof args.cell !== "number" ||
      !Number.isInteger(args.cell) ||
      args.cell < 0
    ) {
      return { error: "cell must be a non-negative integer." };
    }
    return { query: { kind: "cell", cell: args.cell, radius, limit } };
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
  return { query: { kind: "coords", x: args.x, y: args.y, radius, limit } };
}

export function createFindCellsInRadiusTool(
  runtime: FindCellsInRadiusRuntime = defaultFindCellsInRadiusRuntime,
): Tool {
  return {
    name: "find_cells_in_radius",
    description:
      "Find every packed-grid cell whose centroid (`pack.cells.p[i]`) lies within a given `radius` (SVG pixels) of a center point. The center can be given as either a coordinate pair (`x` + `y`, both finite numbers in SVG/map space) or a packed cell id (`cell`, integer — the tool reads `pack.cells.p[cell]` as the center); the two forms are mutually exclusive. Required `radius` (finite number >= 0 — 0 returns only cells exactly at the center). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so large regions don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Uses a squared-distance scan of `pack.cells.p` (no quadtree — keeps results reproducible and independent of `window.findAll`). Returns `{ ok, cells, count, center: { x, y } }`. Useful as a first step for bulk cell operations: flatten a region (`set_cell_height` per cell), audit biomes around a point, pick candidate cells for `add_burg` / `add_marker`, or feed cells into `get_cell_info` for a localized map tour. Errors on missing map, out-of-bounds `cell`, a `cell` with no coordinates in `pack.cells.p`, both forms supplied at once, neither supplied, non-finite `x` / `y`, missing / negative / non-finite `radius`, or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        x: {
          type: "number",
          description:
            "Horizontal coordinate of the center point in SVG pixel space. Required together with `y`; mutually exclusive with `cell`.",
        },
        y: {
          type: "number",
          description:
            "Vertical coordinate of the center point in SVG pixel space. Required together with `x`; mutually exclusive with `cell`.",
        },
        cell: {
          type: "integer",
          minimum: 0,
          description:
            "Packed-grid cell index whose centroid (`pack.cells.p[cell]`) is the center point. Mutually exclusive with `x` / `y`.",
        },
        radius: {
          type: "number",
          minimum: 0,
          description:
            "Search radius in SVG pixels (must be finite and >= 0). Cells whose centroid distance is <= radius are returned.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_IN_RADIUS_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_IN_RADIUS_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
    },
    execute(input: unknown): ToolResult {
      const parsed = parseInput(input);
      if (parsed.error) return errorResult(parsed.error);
      const query = parsed.query as FindCellsInRadiusQuery;
      const result = runtime.find(query);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "out-of-bounds") {
        const cell = (query as { cell?: number }).cell;
        return errorResult(`cell ${cell} is out of bounds.`);
      }
      if (result === "no-cell-point") {
        const cell = (query as { cell?: number }).cell;
        return errorResult(`cell ${cell} has no coordinates.`);
      }
      return okResult({
        cells: result.cells,
        count: result.count,
        center: result.center,
      });
    },
  };
}

export const findCellsInRadiusTool = createFindCellsInRadiusTool();
