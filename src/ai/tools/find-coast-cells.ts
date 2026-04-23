import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_COAST_CELLS_LIMIT = 10000;
export const MAX_FIND_COAST_CELLS_LIMIT = 100000;

export type FindCoastSide = "land" | "water" | "all";

const VALID_SIDES: readonly FindCoastSide[] = ["land", "water", "all"];

interface PackLike {
  cells?: {
    t?: ArrayLike<number>;
  };
}

export interface FindCoastCellsHit {
  cells: number[];
  count: number;
}

export type FindCoastCellsResult = FindCoastCellsHit | "not-ready";

/**
 * Pure collector: given the world state (`pack`) and a coast `side`, return
 * every cell index where `pack.cells.t` marks the cell as coastal.
 *
 * Coast-type semantics (set by `Features.markupPack`):
 *   `+1` = LAND_COAST  — land cell with ≥1 water neighbor.
 *   `-1` = WATER_COAST — water cell with ≥1 land neighbor.
 *   `±2` and higher/lower absolute values are further inland / deeper water
 *       and are NOT returned by this tool.
 *
 * Side mapping:
 *   - `"land"`  → cells where `t === 1`.
 *   - `"water"` → cells where `t === -1`.
 *   - `"all"`   → cells where `t === 1 || t === -1`.
 *
 * `count` reports the full unlimited total even when `cells` is truncated by
 * `limit`. Returns `"not-ready"` when pack / cells / t field are missing or do
 * not expose a numeric `length`.
 */
export function findCoastCellsInPack(
  pack: PackLike | undefined,
  side: FindCoastSide,
  limit: number,
): FindCoastCellsResult {
  if (!pack || !pack.cells) return "not-ready";
  const t = pack.cells.t;
  if (!t || typeof t.length !== "number") return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = t.length;
  for (let i = 0; i < length; i++) {
    const v = t[i];
    let match = false;
    if (side === "land") match = v === 1;
    else if (side === "water") match = v === -1;
    else match = v === 1 || v === -1;
    if (match) {
      count++;
      if (cells.length < cap) cells.push(i);
    }
  }

  return { cells, count };
}

export interface FindCoastCellsRuntime {
  find(side: FindCoastSide, limit: number): FindCoastCellsResult;
}

export const defaultFindCoastCellsRuntime: FindCoastCellsRuntime = {
  find(side, limit) {
    return findCoastCellsInPack(getPack<PackLike>(), side, limit);
  },
};

function parseSide(
  value: unknown,
): { ok: true; side: FindCoastSide } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, side: "land" };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      error: `side must be one of "land", "water", "all" (default "land").`,
    };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "land" || normalized === "water" || normalized === "all") {
    return { ok: true, side: normalized };
  }
  return {
    ok: false,
    error: `side must be one of "land", "water", "all" (default "land").`,
  };
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_COAST_CELLS_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_COAST_CELLS_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_COAST_CELLS_LIMIT}].`;
  }
  return value;
}

export function createFindCoastCellsTool(
  runtime: FindCoastCellsRuntime = defaultFindCoastCellsRuntime,
): Tool {
  return {
    name: "find_coast_cells",
    description:
      'List every packed-grid cell index currently marked as a coastal cell — a bulk counterpart to the coastline used by `add_burg`/harbor logic, and the sibling of `find_cells_by_biome` / `find_cells_by_height_range` / `find_cells_by_temperature_range` that filters by the authoritative coast marker rather than biome, elevation, or climate. The signal is `pack.cells.t` (the distance field set by `Features.markupPack`): `+1 = LAND_COAST` (land cell with ≥1 water neighbor), `-1 = WATER_COAST` (water cell with ≥1 land neighbor); `±2` and higher/lower values are further inland / deeper water and are NOT returned. Optional `side` (case-insensitive string, default `"land"`) selects which layer: `"land"` → cells where `t === 1`, `"water"` → cells where `t === -1`, `"all"` → cells where `t === 1 || t === -1` (the full coastline, both sides). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so large coastlines don\'t blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.t` linearly and collects every index whose sign matches the requested side. Returns `{ ok, side, cells, count }`. Useful as a first step for coastline-aware operations — seed harbor / port candidates for `add_burg`, drop `add_marker` on coastal landmarks, audit reachable beaches, paint coast-band zones, feed cells into `get_cell_info` for a localized shoreline tour, or count shoreline length without walking neighbor lists. Read-only; does not mutate state or trigger redraws. Errors on un-generated map (pack, `pack.cells`, or `pack.cells.t` missing), invalid `side`, or out-of-range `limit`. Requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {
        side: {
          type: "string",
          enum: [...VALID_SIDES],
          description:
            'Which coast layer to return: "land" (cells with t === 1, default), "water" (cells with t === -1), or "all" (both, the full coastline).',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_COAST_CELLS_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_COAST_CELLS_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: [],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { side?: unknown; limit?: unknown };

      const sideParsed = parseSide(input.side);
      if (!sideParsed.ok) return errorResult(sideParsed.error);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.find(sideParsed.side, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        side: sideParsed.side,
        cells: result.cells,
        count: result.count,
      });
    },
  };
}

export const findCoastCellsTool = createFindCoastCellsTool();
