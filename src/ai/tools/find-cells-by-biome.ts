import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

export const DEFAULT_FIND_CELLS_BY_BIOME_LIMIT = 10000;
export const MAX_FIND_CELLS_BY_BIOME_LIMIT = 100000;

interface BiomesDataLike {
  i?: number[];
  name?: string[];
}

interface PackLike {
  cells?: {
    biome?: ArrayLike<number> | number[];
  };
}

export interface FindCellsByBiomeHit {
  i: number;
  name: string;
  cells: number[];
  count: number;
}

export type FindCellsByBiomeResult =
  | FindCellsByBiomeHit
  | "not-ready"
  | "not-found";

/**
 * Pure collector: given the biomes dictionary and the world state (`pack`),
 * return every cell index whose `pack.cells.biome[i]` matches the biome
 * resolved from `ref`. `count` reports the full unlimited total even when
 * `cells` is truncated by `limit`.
 *
 * Returns `"not-ready"` when biomesData / pack / cells / biome field are
 * missing, and `"not-found"` when the ref cannot be resolved (unknown id /
 * name, or a biome retired via the `"removed"` sentinel).
 */
export function findBiomeCellsInPack(
  biomesData: BiomesDataLike | undefined,
  pack: PackLike | undefined,
  ref: number | string,
  limit: number,
): FindCellsByBiomeResult {
  if (!biomesData || !Array.isArray(biomesData.i)) return "not-ready";
  if (!pack || !pack.cells) return "not-ready";
  const cellBiome = pack.cells.biome;
  if (!cellBiome || typeof cellBiome.length !== "number") return "not-ready";

  const res = findBiomeByRef(biomesData, ref);
  if (!res) return "not-found";

  const biomeI = res.id;
  const cap = limit > 0 ? limit : 0;
  const cells: number[] = [];
  let count = 0;
  const length = cellBiome.length;
  for (let i = 0; i < length; i++) {
    if (cellBiome[i] === biomeI) {
      count++;
      if (cells.length < cap) cells.push(i);
    }
  }

  return { i: biomeI, name: res.name, cells, count };
}

export interface FindCellsByBiomeRuntime {
  collect(ref: number | string, limit: number): FindCellsByBiomeResult;
}

export const defaultFindCellsByBiomeRuntime: FindCellsByBiomeRuntime = {
  collect(ref, limit) {
    return findBiomeCellsInPack(
      getGlobal<BiomesDataLike>("biomesData"),
      getPack<PackLike>(),
      ref,
      limit,
    );
  },
};

function parseBiomeRef(
  value: unknown,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error:
      "biome must be a non-negative integer id or a non-empty name string.",
  };
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CELLS_BY_BIOME_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CELLS_BY_BIOME_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CELLS_BY_BIOME_LIMIT}].`;
  }
  return value;
}

export function createFindCellsByBiomeTool(
  runtime: FindCellsByBiomeRuntime = defaultFindCellsByBiomeRuntime,
): Tool {
  return {
    name: "find_cells_by_biome",
    description:
      "List every packed-grid cell index currently assigned to a given biome — the biome parallel of `get_entity_cells` (which handles state / province / culture / religion) and a bulk counterpart to `get_biome_info` (which only reports the count, not the cell ids). Required `biome` identifies the biome by non-negative integer id (0 = Marine is allowed, unlike states / burgs) or case-insensitive current biome name (resolved via the shared `findBiomeByRef`; biomes whose name slot is the sentinel `'removed'` are skipped). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so huge biomes (oceans, grasslands) don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.biome` linearly and collects every index `k` where the value equals the resolved biome's id. Returns `{ ok, biome: { i, name }, cells, count }`. Useful as a first step for bulk biome-wide operations — flatten every cell in a range (`set_cell_height` per cell), audit burgs in a biome, pick candidate cells for `add_burg` / `add_marker`, or feed cells into `get_cell_info` for a localized biome tour. Errors on un-generated map, an unresolvable ref (invalid id, unknown name, retired slot), or out-of-range `limit`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        biome: {
          type: ["integer", "string"],
          description:
            "Non-negative integer biome id (0 = Marine is allowed) or case-insensitive current biome name.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_BY_BIOME_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_BY_BIOME_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["biome"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { biome?: unknown; limit?: unknown };

      const refParsed = parseBiomeRef(input.biome);
      if (!refParsed.ok) return errorResult(refParsed.error);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.collect(refParsed.ref, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No biome found matching ${JSON.stringify(refParsed.ref)}.`,
        );
      }

      return okResult({
        biome: { i: result.i, name: result.name },
        cells: result.cells,
        count: result.count,
      });
    },
  };
}

export const findCellsByBiomeTool = createFindCellsByBiomeTool();
