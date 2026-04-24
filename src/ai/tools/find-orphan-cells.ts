import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_ORPHAN_CELLS_LIMIT = 10000;
export const MAX_FIND_ORPHAN_CELLS_LIMIT = 100000;
const ELEVATION_NEUTRAL_HEIGHT = 20;

interface PackLike {
  cells?: {
    state?: ArrayLike<number>;
    h?: ArrayLike<number>;
  };
}

export interface FindOrphanCellsHit {
  cells: number[];
  count: number;
}

export type FindOrphanCellsResult = FindOrphanCellsHit | "not-ready";

/**
 * Pure collector: given the world state (`pack`), return every cell index
 * `i` where `pack.cells.state[i] === 0` (the Neutrals placeholder) — the
 * orphan / wilderness cells. By default only land cells
 * (`pack.cells.h[i] >= 20`) are included; pass `includeWater=true` to
 * return every orphan cell regardless of elevation. `count` reports the
 * full unlimited total even when `cells` is truncated by `limit`.
 *
 * Returns `"not-ready"` when pack / cells / state field are missing or do
 * not expose a numeric `length`. When `includeWater` is false (the
 * default) the land filter also requires `pack.cells.h` to be present.
 */
export function findOrphanCellsInPack(
  pack: PackLike | undefined,
  includeWater: boolean,
  limit: number,
): FindOrphanCellsResult {
  if (!pack || !pack.cells) return "not-ready";
  const state = pack.cells.state;
  if (!state || typeof state.length !== "number") return "not-ready";
  const h = pack.cells.h;
  if (!includeWater && (!h || typeof h.length !== "number")) {
    return "not-ready";
  }

  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = state.length;
  for (let i = 0; i < length; i++) {
    if (state[i] !== 0) continue;
    if (!includeWater && h && h[i] < ELEVATION_NEUTRAL_HEIGHT) continue;
    count++;
    if (cells.length < cap) cells.push(i);
  }

  return { cells, count };
}

export interface FindOrphanCellsRuntime {
  find(includeWater: boolean, limit: number): FindOrphanCellsResult;
}

export const defaultFindOrphanCellsRuntime: FindOrphanCellsRuntime = {
  find(includeWater, limit) {
    return findOrphanCellsInPack(getPack<PackLike>(), includeWater, limit);
  },
};

function parseIncludeWater(value: unknown): boolean | string {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    return "include_water must be a boolean.";
  }
  return value;
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_ORPHAN_CELLS_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_ORPHAN_CELLS_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_ORPHAN_CELLS_LIMIT}].`;
  }
  return value;
}

export function createFindOrphanCellsTool(
  runtime: FindOrphanCellsRuntime = defaultFindOrphanCellsRuntime,
): Tool {
  return {
    name: "find_orphan_cells",
    description:
      "List every packed-grid cell that is unassigned to any state (`pack.cells.state[i] === 0` — the Neutrals / Wildlands placeholder), optionally filtered to land only. The wilderness / unclaimed-territory parallel of `find_cells_by_biome` (biome filter), `find_cells_by_height_range` (elevation filter), and `get_entity_cells` (cells inside a specific state). The signal is `pack.cells.state`: every `states-generator` pass writes a positive state id to every cell it claims, and leaves `0` for cells it could not assign. Optional `include_water` (boolean, default `false`) — by default only LAND orphans are returned (`pack.cells.h[i] >= 20`, `ELEVATION_NEUTRAL_HEIGHT`), which is almost always what an audit wants (unassigned ocean / lake cells dwarf the interesting wilderness). Pass `include_water=true` to return every `state===0` cell regardless of elevation (useful for verifying full state coverage, or for maps that intentionally assign water cells). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array; `count` reports the full unlimited total even when truncated. Iterates `pack.cells.state` linearly and collects every index whose state is `0` and (unless `include_water`) whose `h >= 20`. Returns `{ok, cells, count, include_water}`. Useful before creating new states or zones to audit uncovered wilderness, to seed candidate cells for `add_state` / `add_zone`, to paint `add_marker` on unclaimed landmarks, or to feed cells into `get_cell_info` for a localized wilderness tour. Read-only; does not mutate state or trigger redraws. Errors on un-generated map (pack, `pack.cells`, `pack.cells.state`, or — when filtering by land — `pack.cells.h` missing), non-boolean `include_water`, or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        include_water: {
          type: "boolean",
          description:
            "When true, also include water cells (any cell with state === 0 regardless of height). Default false — land orphans only (h >= 20).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_ORPHAN_CELLS_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_ORPHAN_CELLS_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        include_water?: unknown;
        limit?: unknown;
      };

      const includeWater = parseIncludeWater(input.include_water);
      if (typeof includeWater === "string") return errorResult(includeWater);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.find(includeWater, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        cells: result.cells,
        count: result.count,
        include_water: includeWater,
      });
    },
  };
}

export const findOrphanCellsTool = createFindOrphanCellsTool();
