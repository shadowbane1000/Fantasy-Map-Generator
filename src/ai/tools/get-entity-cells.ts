import {
  type EntityLike,
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  parseEntityRef,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type EntityType = "state" | "province" | "culture" | "religion";

export const ENTITY_TYPES: EntityType[] = [
  "state",
  "province",
  "culture",
  "religion",
];

export const DEFAULT_GET_ENTITY_CELLS_LIMIT = 10000;
export const MAX_GET_ENTITY_CELLS_LIMIT = 100000;

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  cells?: {
    i?: ArrayLike<number>;
    state?: ArrayLike<number>;
    province?: ArrayLike<number>;
    culture?: ArrayLike<number>;
    religion?: ArrayLike<number>;
  };
  states?: EntityLike[];
  provinces?: EntityLike[];
  cultures?: EntityLike[];
  religions?: EntityLike[];
}

export interface EntityCellsHit {
  i: number;
  name: string;
  cells: number[];
  count: number;
}

export type CollectEntityCellsResult =
  | EntityCellsHit
  | "not-ready"
  | "unknown-entity";

function getCollection(
  pack: PackLike,
  type: EntityType,
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
  type: EntityType,
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
  }
}

/**
 * Pure collector: given the world state (`pack`), an entity type, and a
 * ref, return the matching entity's `{ i, name }` along with the cell
 * indices assigned to it and the total unlimited count. Returns
 * `"not-ready"` when the pack or cells index is missing, and
 * `"unknown-entity"` when the ref does not resolve.
 */
export function collectCellsForEntity(
  pack: PackLike | undefined,
  type: EntityType,
  ref: number | string,
  limit: number,
): CollectEntityCellsResult {
  if (!pack || !pack.cells || !pack.cells.i) return "not-ready";
  const entries = getCollection(pack, type);
  const entity = findEntityByRef(entries, ref);
  if (!entity) return "unknown-entity";

  const field = getCellField(pack, type);
  const cellsIndex = pack.cells.i;
  const cells: number[] = [];
  let count = 0;

  if (field) {
    const targetId = entity.i;
    const len = cellsIndex.length;
    const cap = limit > 0 ? limit : 0;
    for (let k = 0; k < len; k++) {
      if (field[k] === targetId) {
        count++;
        if (cells.length < cap) cells.push(k);
      }
    }
  }

  return {
    i: entity.i,
    name: entity.name ?? "",
    cells,
    count,
  };
}

export interface GetEntityCellsRuntime {
  collect(
    type: EntityType,
    ref: number | string,
    limit: number,
  ): CollectEntityCellsResult;
}

export const defaultGetEntityCellsRuntime: GetEntityCellsRuntime = {
  collect(type, ref, limit) {
    return collectCellsForEntity(getPack<PackLike>(), type, ref, limit);
  },
};

function parseEntityType(value: unknown): EntityType | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  for (const t of ENTITY_TYPES) {
    if (t === needle) return t;
  }
  return null;
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_GET_ENTITY_CELLS_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_GET_ENTITY_CELLS_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_GET_ENTITY_CELLS_LIMIT}].`;
  }
  return value;
}

export function createGetEntityCellsTool(
  runtime: GetEntityCellsRuntime = defaultGetEntityCellsRuntime,
): Tool {
  return {
    name: "get_entity_cells",
    description:
      "List every packed-grid cell index currently assigned to a given state, province, culture, or religion. Required inputs: `entity_type` (case-insensitive string, one of 'state', 'province', 'culture', 'religion') and `entity` (positive integer id OR case-insensitive name / fullName — resolved via the shared `findEntityByRef`, which skips the index-0 placeholder and any `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `cells` array so huge territories don't blow up the response; `count` reports the full unlimited total even when `cells` is truncated. Iterates `pack.cells.state | province | culture | religion` (the matching field) and collects every index `k` where the value equals the resolved entity's id. Returns `{ ok, entity_type, i, name, cells, count }`. Useful when the AI needs to reason about a territory's distribution — e.g. before picking cells for `add_burg`, computing a region's bounding box / centroid, or auditing border cells. Errors on invalid `entity_type`, missing / unresolvable `entity`, out-of-range `limit`, or an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          description:
            "Which entity collection to search: 'state', 'province', 'culture', or 'religion' (case-insensitive).",
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Positive integer id or case-insensitive name / fullName of the entity.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_GET_ENTITY_CELLS_LIMIT,
          description:
            "Maximum cells to return in the response (default 10000). `count` still reports the full unlimited total.",
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
          `entity_type must be one of ${ENTITY_TYPES.map((t) => `'${t}'`).join(", ")}.`,
        );
      }

      const refParsed = parseEntityRef(args.entity, "entity");
      if (!refParsed.ok) return errorResult(refParsed.error);

      const limit = parseLimit(args.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.collect(type, refParsed.ref, limit);
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

export const getEntityCellsTool = createGetEntityCellsTool();
