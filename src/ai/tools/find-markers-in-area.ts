import { errorResult, getPack, okResult, type RawMarker } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_MARKERS_IN_AREA_LIMIT = 10000;
export const MAX_FIND_MARKERS_IN_AREA_LIMIT = 100000;

export interface FindMarkersInAreaHit {
  i: number;
  type: string | null;
  icon: string | null;
  x: number;
  y: number;
  distance: number | null;
}

export type FindMarkersInAreaArea =
  | { kind: "rect"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "circle"; x: number; y: number; radius: number };

export interface FindMarkersInAreaPayload {
  markers: FindMarkersInAreaHit[];
  count: number;
  area: FindMarkersInAreaArea;
}

export type FindMarkersInAreaQuery =
  | {
      kind: "rect";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      type: string | null;
      limit: number;
    }
  | {
      kind: "circle-coords";
      x: number;
      y: number;
      radius: number;
      type: string | null;
      limit: number;
    }
  | {
      kind: "circle-cell";
      cell: number;
      radius: number;
      type: string | null;
      limit: number;
    };

export type FindMarkersInAreaResult =
  | FindMarkersInAreaPayload
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

function resolveCircleCenter(
  pack: PackLike,
  query: FindMarkersInAreaQuery,
): [number, number] | "out-of-bounds" | "no-cell-point" | null {
  if (query.kind === "rect") return null;
  if (query.kind === "circle-coords") return [query.x, query.y];
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
 * Pure scanner: collects every active marker in `pack.markers` whose (x, y)
 * lies inside the requested rectangle or circle. Skips `removed: true`
 * entries, markers missing coordinates, and (when `type` is set) markers
 * whose `type` doesn't match (case-insensitive exact).
 * `count` reports the full total even when `markers` is truncated by `limit`.
 * `distance` is populated for circle queries only.
 */
export function findMarkersInAreaInPack(
  pack: PackLike | undefined,
  query: FindMarkersInAreaQuery,
): FindMarkersInAreaResult {
  if (!pack || !pack.markers) return "not-ready";

  let area: FindMarkersInAreaArea;
  let cx = 0;
  let cy = 0;
  let r2 = 0;

  if (query.kind === "rect") {
    const x1 = Math.min(query.x1, query.x2);
    const x2 = Math.max(query.x1, query.x2);
    const y1 = Math.min(query.y1, query.y2);
    const y2 = Math.max(query.y1, query.y2);
    area = { kind: "rect", x1, y1, x2, y2 };
  } else {
    const center = resolveCircleCenter(pack, query);
    if (center === "out-of-bounds") return "out-of-bounds";
    if (center === "no-cell-point") return "no-cell-point";
    if (center === null) return "not-ready"; // unreachable
    [cx, cy] = center;
    r2 = query.radius * query.radius;
    area = { kind: "circle", x: cx, y: cy, radius: query.radius };
  }

  const typeFilter = query.type;
  const cap = query.limit > 0 ? query.limit : 0;
  const markers: FindMarkersInAreaHit[] = [];
  let count = 0;

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

    let distance: number | null = null;
    if (area.kind === "rect") {
      if (mx < area.x1 || mx > area.x2) continue;
      if (my < area.y1 || my > area.y2) continue;
    } else {
      const dx = mx - cx;
      const dy = my - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      distance = Math.sqrt(d2);
    }

    count++;
    if (markers.length < cap) {
      markers.push({
        i: m.i,
        type: typeof m.type === "string" ? m.type : null,
        icon: typeof m.icon === "string" ? m.icon : null,
        x: mx,
        y: my,
        distance,
      });
    }
  }

  return { markers, count, area };
}

export interface FindMarkersInAreaRuntime {
  find(query: FindMarkersInAreaQuery): FindMarkersInAreaResult;
}

export const defaultFindMarkersInAreaRuntime: FindMarkersInAreaRuntime = {
  find(query) {
    return findMarkersInAreaInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindMarkersInAreaQuery;
  error?: string;
}

function parseLimit(raw: unknown): number | string {
  if (raw === undefined || raw === null)
    return DEFAULT_FIND_MARKERS_IN_AREA_LIMIT;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_FIND_MARKERS_IN_AREA_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_MARKERS_IN_AREA_LIMIT}].`;
  }
  return raw;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseInput(rawInput: unknown): ParsedInput {
  const args = (rawInput ?? {}) as {
    x1?: unknown;
    y1?: unknown;
    x2?: unknown;
    y2?: unknown;
    x?: unknown;
    y?: unknown;
    cell?: unknown;
    radius?: unknown;
    type?: unknown;
    limit?: unknown;
  };

  const hasAnyRect =
    args.x1 !== undefined ||
    args.y1 !== undefined ||
    args.x2 !== undefined ||
    args.y2 !== undefined;
  const hasAllRect =
    args.x1 !== undefined &&
    args.y1 !== undefined &&
    args.x2 !== undefined &&
    args.y2 !== undefined;
  const hasX = args.x !== undefined && args.x !== null;
  const hasY = args.y !== undefined && args.y !== null;
  const hasCell = args.cell !== undefined && args.cell !== null;
  const hasRadius = args.radius !== undefined && args.radius !== null;
  const hasAnyCircle = hasX || hasY || hasCell || hasRadius;

  if (!hasAnyRect && !hasAnyCircle) {
    return {
      error:
        "Provide either a rectangle (x1, y1, x2, y2) or a circle (x+y or cell, plus radius).",
    };
  }
  if (hasAnyRect && hasAnyCircle) {
    return {
      error:
        "Provide either rectangle (x1/y1/x2/y2) or circle params, not both.",
    };
  }

  let typeFilter: string | null = null;
  if (args.type !== undefined && args.type !== null) {
    if (typeof args.type !== "string" || !args.type.trim()) {
      return { error: "type must be a non-empty string." };
    }
    typeFilter = args.type.trim().toLowerCase();
  }

  const limitParsed = parseLimit(args.limit);
  if (typeof limitParsed === "string") return { error: limitParsed };
  const limit = limitParsed;

  if (hasAnyRect) {
    if (!hasAllRect) {
      return { error: "Rectangle requires all of x1, y1, x2, y2." };
    }
    if (
      !isFiniteNum(args.x1) ||
      !isFiniteNum(args.y1) ||
      !isFiniteNum(args.x2) ||
      !isFiniteNum(args.y2)
    ) {
      return { error: "x1, y1, x2, y2 must all be finite numbers." };
    }
    return {
      query: {
        kind: "rect",
        x1: args.x1,
        y1: args.y1,
        x2: args.x2,
        y2: args.y2,
        type: typeFilter,
        limit,
      },
    };
  }

  // Circle form
  if (!hasRadius) {
    return { error: "radius is required for circle queries." };
  }
  if (!isFiniteNum(args.radius) || args.radius < 0) {
    return { error: "radius must be a finite number >= 0." };
  }
  const radius = args.radius;

  if ((hasX || hasY) && hasCell) {
    return {
      error: "Provide either (x, y) or cell for the circle center, not both.",
    };
  }
  if (!hasX && !hasY && !hasCell) {
    return {
      error: "Circle query needs a center: (x, y) coordinates or a cell id.",
    };
  }

  if (hasCell) {
    if (
      typeof args.cell !== "number" ||
      !Number.isInteger(args.cell) ||
      args.cell < 0
    ) {
      return { error: "cell must be a non-negative integer." };
    }
    return {
      query: {
        kind: "circle-cell",
        cell: args.cell,
        radius,
        type: typeFilter,
        limit,
      },
    };
  }

  if (!hasX || !hasY) {
    return { error: "x and y must both be provided for a circle center." };
  }
  if (!isFiniteNum(args.x) || !isFiniteNum(args.y)) {
    return { error: "x and y must be finite numbers." };
  }
  return {
    query: {
      kind: "circle-coords",
      x: args.x,
      y: args.y,
      radius,
      type: typeFilter,
      limit,
    },
  };
}

export function createFindMarkersInAreaTool(
  runtime: FindMarkersInAreaRuntime = defaultFindMarkersInAreaRuntime,
): Tool {
  return {
    name: "find_markers_in_area",
    description:
      "List every active marker (point of interest — castle, battle site, mine, volcano, shipwreck, etc.) whose (x, y) lies inside a caller-specified area on the current map. Two mutually-exclusive area forms: (a) rectangle — supply `x1`, `y1`, `x2`, `y2` (all finite numbers in SVG/map space; corners may be given in any order, the tool normalises so `x1 <= x2` and `y1 <= y2`); (b) circle — supply `radius` (finite number >= 0) plus a center given as either `x` + `y` (finite numbers) OR `cell` (non-negative integer — the tool reads `pack.cells.p[cell]` as the center). Boundary markers (on the edge of the rect or at distance === radius) are included. Optional `type` (non-empty string) filters `pack.markers` by case-insensitive exact match of `marker.type` (e.g. 'castle', 'battlefield', 'volcano'). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `markers` array so large regions don't blow up the response; `count` still reports the full unlimited total. Scans `pack.markers` linearly, skipping any `removed: true` markers and (when a type filter is set) any markers whose `type` doesn't match, and returns `{ ok, markers, count, area }` where each marker is `{ i, type, icon, x, y, distance }`. `distance` is populated (Euclidean pixels from center) for circle queries and `null` for rectangle queries. When no marker matches, `markers` is `[]` and `count` is `0` — this is still `ok: true`. Errors on missing map, out-of-bounds `cell`, a `cell` with no coordinates in `pack.cells.p`, both area forms supplied at once, neither form supplied, incomplete rectangle (any of x1/y1/x2/y2 missing), non-finite numbers, missing / negative / non-finite `radius`, empty-string / non-string `type`, or out-of-range `limit`. Useful as a first step for bulk marker operations — audit every castle inside a state-shaped box, feed marker ids into `get_marker_info`, or filter candidates for `set_marker_type` / `set_marker_icon` / `move_marker` / `remove_marker`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        x1: {
          type: "number",
          description:
            "Rectangle corner 1 x coordinate (SVG pixels). Required with y1/x2/y2 for rectangle queries; mutually exclusive with circle params.",
        },
        y1: {
          type: "number",
          description:
            "Rectangle corner 1 y coordinate (SVG pixels). Required with x1/x2/y2 for rectangle queries.",
        },
        x2: {
          type: "number",
          description:
            "Rectangle corner 2 x coordinate (SVG pixels). Required with x1/y1/y2 for rectangle queries.",
        },
        y2: {
          type: "number",
          description:
            "Rectangle corner 2 y coordinate (SVG pixels). Required with x1/y1/x2 for rectangle queries.",
        },
        x: {
          type: "number",
          description:
            "Circle center x coordinate (SVG pixels). Required together with `y`; mutually exclusive with `cell` and with rectangle params.",
        },
        y: {
          type: "number",
          description:
            "Circle center y coordinate (SVG pixels). Required together with `x`; mutually exclusive with `cell`.",
        },
        cell: {
          type: "integer",
          minimum: 0,
          description:
            "Packed-grid cell index whose centroid (`pack.cells.p[cell]`) is the circle center. Mutually exclusive with `x` / `y` and rectangle params.",
        },
        radius: {
          type: "number",
          minimum: 0,
          description:
            "Circle radius in SVG pixels (finite, >= 0). Required for circle queries; irrelevant for rectangles.",
        },
        type: {
          type: "string",
          description:
            "Optional marker type filter (e.g. 'castle', 'battlefield'). Case-insensitive exact match against `marker.type`.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_MARKERS_IN_AREA_LIMIT,
          description: `Maximum markers to return in the response (default ${DEFAULT_FIND_MARKERS_IN_AREA_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
    },
    execute(input: unknown): ToolResult {
      const parsed = parseInput(input);
      if (parsed.error) return errorResult(parsed.error);
      const query = parsed.query as FindMarkersInAreaQuery;
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
        markers: result.markers,
        count: result.count,
        area: result.area,
      });
    },
  };
}

export const findMarkersInAreaTool = createFindMarkersInAreaTool();
