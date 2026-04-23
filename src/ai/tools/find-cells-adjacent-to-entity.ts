import {
  type EntityLike,
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

export type AdjacentEntityType =
  | "state"
  | "province"
  | "culture"
  | "religion"
  | "biome";

export const ADJACENT_ENTITY_TYPES: AdjacentEntityType[] = [
  "state",
  "province",
  "culture",
  "religion",
  "biome",
];

export const DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT = 10000;
export const MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT = 100000;

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  cells?: {
    i?: ArrayLike<number>;
    c?: ArrayLike<ArrayLike<number> | number[] | undefined>;
    state?: ArrayLike<number>;
    province?: ArrayLike<number>;
    culture?: ArrayLike<number>;
    religion?: ArrayLike<number>;
    biome?: ArrayLike<number>;
  };
  states?: EntityLike[];
  provinces?: EntityLike[];
  cultures?: EntityLike[];
  religions?: EntityLike[];
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
}

export interface AdjacentEntityCellsHit {
  i: number;
  name: string;
  cells: number[];
  count: number;
}

export type CollectAdjacentCellsResult =
  | AdjacentEntityCellsHit
  | "not-ready"
  | "unknown-entity";

function getEntityCollection(
  pack: PackLike,
  type: Exclude<AdjacentEntityType, "biome">,
): EntityLike[] | undefined {
  switch (type) {
    case "state":
      return pack.states;
    case "province":
      return pack.provinces;
    case "culture":
      return pack.cultures;
    case "religion":
      return pack.religions;
  }
}

function getCellField(
  pack: PackLike,
  type: AdjacentEntityType,
): ArrayLike<number> | undefined {
  const cells = pack.cells;
  if (!cells) return undefined;
  switch (type) {
    case "state":
      return cells.state;
    case "province":
      return cells.province;
    case "culture":
      return cells.culture;
    case "religion":
      return cells.religion;
    case "biome":
      return cells.biome;
  }
}

/**
 * Pure collector: given the world state (`pack`), the biomes dictionary
 * (only used for `type === "biome"`), an entity type, and a ref, return
 * the distinct set of packed-cell ids that NEIGHBOR any cell in the
 * entity but are themselves NOT in the entity — i.e. the "border ring"
 * of cells just outside the entity's territory.
 *
 * Iterates `pack.cells` once; for every cell `k` whose
 * `pack.cells.<field>[k]` equals the resolved entity's id, walks
 * `pack.cells.c[k]` and includes any neighbor whose own field value
 * differs. The output array is deduplicated (insertion order of first
 * encounter) and sorted ascending. `count` reports the full unlimited
 * total even when `cells` is truncated by `limit`.
 *
 * Returns `"not-ready"` when pack / cells index / neighbor list (or
 * biomesData for the biome domain) is missing, and `"unknown-entity"`
 * when the ref cannot be resolved.
 */
export function collectAdjacentCellsForEntity(
  pack: PackLike | undefined,
  biomesData: BiomesDataLike | undefined,
  type: AdjacentEntityType,
  ref: number | string,
  limit: number,
): CollectAdjacentCellsResult {
  if (!pack || !pack.cells || !pack.cells.i || !pack.cells.c) {
    return "not-ready";
  }

  let entityI: number;
  let entityName: string;

  if (type === "biome") {
    if (!biomesData || !Array.isArray(biomesData.i)) return "not-ready";
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return "unknown-entity";
    entityI = res.id;
    entityName = res.name;
  } else {
    const entries = getEntityCollection(pack, type);
    const entity = findEntityByRef(entries, ref);
    if (!entity) return "unknown-entity";
    entityI = entity.i;
    entityName = entity.name ?? "";
  }

  const field = getCellField(pack, type);
  const cellsIndex = pack.cells.i;
  const neighbors = pack.cells.c;
  const cap = limit > 0 ? limit : 0;

  const seen = new Set<number>();
  if (field) {
    const len = cellsIndex.length;
    for (let k = 0; k < len; k++) {
      if (field[k] !== entityI) continue;
      const neigh = neighbors[k];
      if (!neigh) continue;
      const nLen = neigh.length;
      for (let j = 0; j < nLen; j++) {
        const n = neigh[j];
        if (typeof n !== "number") continue;
        if (n < 0 || n >= len) continue;
        if (field[n] === entityI) continue;
        seen.add(n);
      }
    }
  }

  const all = Array.from(seen).sort((a, b) => a - b);
  const cells = cap > 0 && all.length > cap ? all.slice(0, cap) : all;

  return {
    i: entityI,
    name: entityName,
    cells,
    count: all.length,
  };
}

export interface FindCellsAdjacentToEntityRuntime {
  collect(
    type: AdjacentEntityType,
    ref: number | string,
    limit: number,
  ): CollectAdjacentCellsResult;
}

export const defaultFindCellsAdjacentToEntityRuntime: FindCellsAdjacentToEntityRuntime =
  {
    collect(type, ref, limit) {
      return collectAdjacentCellsForEntity(
        getPack<PackLike>(),
        getGlobal<BiomesDataLike>("biomesData"),
        type,
        ref,
        limit,
      );
    },
  };

function parseEntityType(value: unknown): AdjacentEntityType | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  for (const t of ADJACENT_ENTITY_TYPES) {
    if (t === needle) return t;
  }
  return null;
}

function parseBiomeEntityRef(
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
      "entity must be a non-negative integer id or a non-empty name string for the biome domain.",
  };
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT}].`;
  }
  return value;
}

export function createFindCellsAdjacentToEntityTool(
  runtime: FindCellsAdjacentToEntityRuntime = defaultFindCellsAdjacentToEntityRuntime,
): Tool {
  return {
    name: "find_cells_adjacent_to_entity",
    description:
      "List every packed-grid cell that is a direct Voronoi neighbor of a cell in a given state / province / culture / religion / biome but is itself OUTSIDE that entity — i.e. the 'border ring' of cells just outside the entity's territory. Complements `get_entity_cells` (which returns the cells INSIDE an entity) and `find_cells_by_biome` (inside a biome). Required `entity_type` (case-insensitive string, one of 'state', 'province', 'culture', 'religion', 'biome') and `entity`. For state / province / culture / religion, `entity` is a positive integer id OR case-insensitive name / fullName (resolved via the shared `findEntityByRef`, skipping the index-0 placeholder and `removed: true` entries). For biome, `entity` is a non-negative integer id (0 = Marine is allowed) OR case-insensitive current biome name (resolved via `findBiomeByRef`; the sentinel `'removed'` slot is skipped). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array; `count` reports the full unlimited total. Algorithm: for each cell `k` with `pack.cells.<field>[k] === entityI`, walk `pack.cells.c[k]` and include each neighbor whose own field differs. Result is deduplicated and returned sorted ascending. Returns `{ ok, entity_type, i, name, cells, count }`. Useful for audit/border analysis, setting zones on frontiers, placing markers on the edge of a territory, picking cells for expansion, or inspecting cross-border neighbors with `get_cell_info`. Errors on invalid `entity_type`, missing / unresolvable `entity`, out-of-range `limit`, or an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          description:
            "Which entity collection to search: 'state', 'province', 'culture', 'religion', or 'biome' (case-insensitive).",
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Positive integer id (non-negative for 'biome' — 0 = Marine) or case-insensitive name / fullName of the entity.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT,
          description: `Maximum cells to return in the response (default ${DEFAULT_FIND_CELLS_ADJACENT_TO_ENTITY_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["entity_type", "entity"],
    },
    execute(input: unknown): ToolResult {
      const args = (input ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
        limit?: unknown;
      };

      const type = parseEntityType(args.entity_type);
      if (!type) {
        return errorResult(
          `entity_type must be one of ${ADJACENT_ENTITY_TYPES.map((t) => `'${t}'`).join(", ")}.`,
        );
      }

      let ref: number | string;
      if (type === "biome") {
        const parsed = parseBiomeEntityRef(args.entity);
        if (!parsed.ok) return errorResult(parsed.error);
        ref = parsed.ref;
      } else {
        const parsed = parseEntityRef(args.entity, "entity");
        if (!parsed.ok) return errorResult(parsed.error);
        ref = parsed.ref;
      }

      const limit = parseLimit(args.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.collect(type, ref, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "unknown-entity") {
        return errorResult(
          `Could not resolve ${type} ${JSON.stringify(args.entity)}.`,
        );
      }

      return okResult({
        entity_type: type,
        i: result.i,
        name: result.name,
        cells: result.cells,
        count: result.count,
      });
    },
  };
}

export const findCellsAdjacentToEntityTool =
  createFindCellsAdjacentToEntityTool();
