import { errorResult, getPack, okResult, type RawProvince } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_PROVINCES_IN_AREA_LIMIT = 10000;
export const MAX_FIND_PROVINCES_IN_AREA_LIMIT = 100000;

export interface FindProvincesInAreaHit {
  i: number;
  name: string;
  fullName: string | null;
  color: string | null;
  x: number;
  y: number;
  distance: number | null;
}

export type FindProvincesInAreaArea =
  | { kind: "rect"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "circle"; x: number; y: number; radius: number };

export interface FindProvincesInAreaPayload {
  provinces: FindProvincesInAreaHit[];
  count: number;
  area: FindProvincesInAreaArea;
}

export type FindProvincesInAreaQuery =
  | {
      kind: "rect";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      limit: number;
    }
  | {
      kind: "circle-coords";
      x: number;
      y: number;
      radius: number;
      limit: number;
    }
  | { kind: "circle-cell"; cell: number; radius: number; limit: number };

export type FindProvincesInAreaResult =
  | FindProvincesInAreaPayload
  | "not-ready"
  | "out-of-bounds"
  | "no-cell-point";

interface PackLike {
  provinces?: RawProvince[];
  cells?: {
    i?: ArrayLike<number>;
    p?: ArrayLike<[number, number] | undefined>;
  };
}

function resolveCircleCenter(
  pack: PackLike,
  query: FindProvincesInAreaQuery,
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

function resolveProvincePosition(
  pack: PackLike,
  province: RawProvince,
): [number, number] | null {
  // 1. Prefer province.pole when it's a valid [x, y] pair.
  if (Array.isArray(province.pole)) {
    const px = province.pole[0];
    const py = province.pole[1];
    if (typeof px === "number" && typeof py === "number") return [px, py];
  }
  // 2. Fallback to pack.cells.p[province.center].
  if (typeof province.center === "number") {
    const p = pack.cells?.p?.[province.center];
    if (Array.isArray(p)) {
      const cx = p[0];
      const cy = p[1];
      if (typeof cx === "number" && typeof cy === "number") return [cx, cy];
    }
  }
  return null;
}

/**
 * Pure scanner: collects every active province in `pack.provinces` whose
 * position lies inside the requested rectangle or circle. Position is
 * `province.pole` when present (as a valid [x, y] pair); otherwise falls
 * back to `pack.cells.p[province.center]`. Skips the index-0 placeholder,
 * `removed: true` entries, and provinces with no resolvable position.
 * `count` reports the full total even when `provinces` is truncated by
 * `limit`. `distance` is populated for circle queries only.
 */
export function findProvincesInAreaInPack(
  pack: PackLike | undefined,
  query: FindProvincesInAreaQuery,
): FindProvincesInAreaResult {
  if (!pack || !pack.provinces) return "not-ready";

  let area: FindProvincesInAreaArea;
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

  const cap = query.limit > 0 ? query.limit : 0;
  const provinces: FindProvincesInAreaHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.provinces.length; k++) {
    const p = pack.provinces[k];
    if (!p) continue;
    if (p.i === 0) continue;
    if (p.removed) continue;

    const pos = resolveProvincePosition(pack, p);
    if (!pos) continue;
    const [px, py] = pos;

    let distance: number | null = null;
    if (area.kind === "rect") {
      if (px < area.x1 || px > area.x2) continue;
      if (py < area.y1 || py > area.y2) continue;
    } else {
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      distance = Math.sqrt(d2);
    }

    count++;
    if (provinces.length < cap) {
      provinces.push({
        i: p.i,
        name: typeof p.name === "string" ? p.name : "",
        fullName: typeof p.fullName === "string" ? p.fullName : null,
        color: typeof p.color === "string" ? p.color : null,
        x: px,
        y: py,
        distance,
      });
    }
  }

  return { provinces, count, area };
}

export interface FindProvincesInAreaRuntime {
  find(query: FindProvincesInAreaQuery): FindProvincesInAreaResult;
}

export const defaultFindProvincesInAreaRuntime: FindProvincesInAreaRuntime = {
  find(query) {
    return findProvincesInAreaInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindProvincesInAreaQuery;
  error?: string;
}

function parseLimit(raw: unknown): number | string {
  if (raw === undefined || raw === null)
    return DEFAULT_FIND_PROVINCES_IN_AREA_LIMIT;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_FIND_PROVINCES_IN_AREA_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_PROVINCES_IN_AREA_LIMIT}].`;
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
    return { query: { kind: "circle-cell", cell: args.cell, radius, limit } };
  }

  if (!hasX || !hasY) {
    return { error: "x and y must both be provided for a circle center." };
  }
  if (!isFiniteNum(args.x) || !isFiniteNum(args.y)) {
    return { error: "x and y must be finite numbers." };
  }
  return {
    query: { kind: "circle-coords", x: args.x, y: args.y, radius, limit },
  };
}

export function createFindProvincesInAreaTool(
  runtime: FindProvincesInAreaRuntime = defaultFindProvincesInAreaRuntime,
): Tool {
  return {
    name: "find_provinces_in_area",
    description:
      "List every active province whose position lies inside a caller-specified area on the current map — the many-province parallel to `find_burgs_in_area` / `find_markers_in_area` / `find_rivers_in_area` and a spatial companion to `list_provinces` / `find_provinces_by_state`. Each province is positioned by its **pole** (`province.pole` — the 'pole of inaccessibility' used for placing labels, the best single anchor for a polygonal province), falling back to the center-cell centroid `pack.cells.p[province.center]` when the pole is missing or malformed. Two mutually-exclusive area forms: (a) rectangle — supply `x1`, `y1`, `x2`, `y2` (all finite numbers in SVG/map space; corners may be given in any order, the tool normalises so `x1 <= x2` and `y1 <= y2`); (b) circle — supply `radius` (finite number >= 0) plus a center given as either `x` + `y` (finite numbers) OR `cell` (non-negative integer — the tool reads `pack.cells.p[cell]` as the center). Boundary provinces (on the edge of the rect or at distance === radius) are included. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `provinces` array so large regions don't blow up the response; `count` still reports the full unlimited total. Scans `pack.provinces` linearly, skipping the index-0 placeholder, any `removed: true` provinces, and any province with no resolvable pole *or* center coordinates. Returns `{ ok, provinces, count, area }` where each province is `{ i, name, fullName, color, x, y, distance }` — `x` / `y` are the resolved pole-or-center position. `distance` is populated (Euclidean pixels from center) for circle queries and `null` for rectangle queries. When no province matches, `provinces` is `[]` and `count` is `0` — this is still `ok: true`. Errors on missing map, out-of-bounds `cell`, a `cell` with no coordinates in `pack.cells.p`, both area forms supplied at once, neither form supplied, incomplete rectangle (any of x1/y1/x2/y2 missing), non-finite numbers, missing / negative / non-finite `radius`, or out-of-range `limit`. Useful as a first step for bulk province operations — audit every province in a region, feed province ids into `get_province_info`, or filter candidates for `rename_province` / `set_province_capital` / `set_province_color` / `set_province_form` / `set_province_coa_custom` / `regenerate_province_coa` / `regenerate_province_name` / `remove_province`. Requires an Anthropic API key (see 'Getting an API key' below).",
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
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_PROVINCES_IN_AREA_LIMIT,
          description: `Maximum provinces to return in the response (default ${DEFAULT_FIND_PROVINCES_IN_AREA_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
    },
    execute(input: unknown): ToolResult {
      const parsed = parseInput(input);
      if (parsed.error) return errorResult(parsed.error);
      const query = parsed.query as FindProvincesInAreaQuery;
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
        provinces: result.provinces,
        count: result.count,
        area: result.area,
      });
    },
  };
}

export const findProvincesInAreaTool = createFindProvincesInAreaTool();
