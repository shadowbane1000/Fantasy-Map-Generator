import {
  type EntityLike,
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
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

export const DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT = 1000;
export const MAX_FIND_ADJACENT_ENTITIES_LIMIT = 100000;

interface ArrayLikeReadonly<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  cells?: {
    i?: ArrayLikeReadonly<number>;
    c?: ArrayLikeReadonly<ArrayLikeReadonly<number>>;
    state?: ArrayLikeReadonly<number>;
    province?: ArrayLikeReadonly<number>;
    culture?: ArrayLikeReadonly<number>;
    religion?: ArrayLikeReadonly<number>;
    biome?: ArrayLikeReadonly<number>;
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

export interface AdjacentEntityRef {
  i: number;
  name: string;
}

export interface FindAdjacentEntitiesHit {
  i: number;
  name: string;
  adjacent: AdjacentEntityRef[];
  count: number;
}

export type FindAdjacentEntitiesResult =
  | FindAdjacentEntitiesHit
  | "not-ready"
  | "unknown-entity";

function getCellField(
  pack: PackLike,
  type: AdjacentEntityType,
): ArrayLikeReadonly<number> | undefined {
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

function getCollection(
  pack: PackLike,
  type: AdjacentEntityType,
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
    case "biome":
      return undefined;
  }
}

function resolveSource(
  pack: PackLike,
  biomesData: BiomesDataLike | undefined,
  type: AdjacentEntityType,
  ref: number | string,
): AdjacentEntityRef | null {
  if (type === "biome") {
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return null;
    return { i: res.id, name: res.name };
  }
  const entity = findEntityByRef(getCollection(pack, type), ref);
  if (!entity) return null;
  return { i: entity.i, name: entity.name ?? "" };
}

function resolveAdjacentRef(
  pack: PackLike,
  biomesData: BiomesDataLike | undefined,
  type: AdjacentEntityType,
  id: number,
): AdjacentEntityRef | null {
  if (type === "biome") {
    const res = findBiomeByRef(biomesData, id);
    if (!res) return null;
    return { i: res.id, name: res.name };
  }
  // For id 0 (Neutrals / Wildlands / No religion), `findEntityByRef`
  // rejects id 0, so look up the placeholder directly.
  const collection = getCollection(pack, type);
  if (!collection) return null;
  if (id === 0) {
    const placeholder = collection[0];
    if (!placeholder || placeholder.removed) return null;
    return { i: 0, name: placeholder.name ?? "" };
  }
  const entity = findEntityByRef(collection, id);
  if (!entity) return null;
  return { i: entity.i, name: entity.name ?? "" };
}

/**
 * Pure collector: given the world state (`pack`, optional `biomesData`
 * for biome-type lookups), an entity type, a ref to the source, and
 * options, return every distinct entity of the same type whose cells
 * share at least one border with the source entity's cells.
 *
 * Returns `"not-ready"` when the pack / cells / neighbors / field are
 * missing, and `"unknown-entity"` when the ref does not resolve.
 */
export function findAdjacentEntitiesInPack(
  biomesData: BiomesDataLike | undefined,
  pack: PackLike | undefined,
  type: AdjacentEntityType,
  ref: number | string,
  includeNeutrals: boolean,
  limit: number,
): FindAdjacentEntitiesResult {
  if (!pack || !pack.cells || !pack.cells.i || !pack.cells.c) {
    return "not-ready";
  }
  const field = getCellField(pack, type);
  if (!field) return "not-ready";

  const source = resolveSource(pack, biomesData, type, ref);
  if (!source) return "unknown-entity";

  const cellsI = pack.cells.i;
  const neighbors = pack.cells.c;
  const srcId = source.i;
  const len = cellsI.length;
  const adjacentIds = new Set<number>();

  for (let k = 0; k < len; k++) {
    if (field[k] !== srcId) continue;
    const nbrs = neighbors[k];
    if (!nbrs || typeof nbrs.length !== "number") continue;
    for (let j = 0; j < nbrs.length; j++) {
      const nbr = nbrs[j];
      const v = field[nbr];
      if (v === undefined) continue;
      if (v === srcId) continue;
      if (v === 0 && !includeNeutrals) continue;
      adjacentIds.add(v);
    }
  }

  const refs: AdjacentEntityRef[] = [];
  for (const id of adjacentIds) {
    const resolved = resolveAdjacentRef(pack, biomesData, type, id);
    if (resolved) refs.push(resolved);
  }
  refs.sort((a, b) => a.i - b.i);

  const cap = limit > 0 ? limit : 0;
  const adjacent = refs.length > cap ? refs.slice(0, cap) : refs;

  return {
    i: source.i,
    name: source.name,
    adjacent,
    count: refs.length,
  };
}

export interface FindAdjacentEntitiesRuntime {
  collect(
    type: AdjacentEntityType,
    ref: number | string,
    includeNeutrals: boolean,
    limit: number,
  ): FindAdjacentEntitiesResult;
}

export const defaultFindAdjacentEntitiesRuntime: FindAdjacentEntitiesRuntime = {
  collect(type, ref, includeNeutrals, limit) {
    return findAdjacentEntitiesInPack(
      getGlobal<BiomesDataLike>("biomesData"),
      getPack<PackLike>(),
      type,
      ref,
      includeNeutrals,
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

function parseRef(
  value: unknown,
  type: AdjacentEntityType,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (type === "biome") {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return { ok: true, ref: value };
    }
    if (typeof value === "string" && value.trim()) {
      return { ok: true, ref: value };
    }
    return {
      ok: false,
      error:
        "entity must be a non-negative integer id or a non-empty name string.",
    };
  }
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error: "entity must be a positive integer id or a non-empty name string.",
  };
}

function parseIncludeNeutrals(value: unknown): boolean | string {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  return "include_neutrals must be a boolean.";
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_ADJACENT_ENTITIES_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_ADJACENT_ENTITIES_LIMIT}].`;
  }
  return value;
}

export function createFindAdjacentEntitiesTool(
  runtime: FindAdjacentEntitiesRuntime = defaultFindAdjacentEntitiesRuntime,
): Tool {
  return {
    name: "find_adjacent_entities",
    description:
      "Given a source entity (state / province / culture / religion / biome), list every DISTINCT entity of the same type whose cells share at least one border with the source — the adjacency parallel of `get_entity_cells` (which lists a single entity's cells) and `find_cells_by_biome` (biome bulk list). Required `entity_type` (case-insensitive, one of 'state', 'province', 'culture', 'religion', 'biome') and `entity` (positive integer id — non-negative for biome where 0 = Marine — OR case-insensitive name / fullName; resolved via the shared `findEntityByRef` for the first four types and `findBiomeByRef` for biomes, skipping the index-0 placeholder / `removed: true` entries / the `'removed'` biome sentinel). Optional `include_neutrals` (boolean, default false) — when true, includes id 0 (Neutrals / Wildlands / No religion) in the adjacent set if it touches the source; biome has no neutral-0 concept so the flag is a no-op there (Marine is always included). Optional `limit` (integer in [1, 100000], default 1000) caps the returned `adjacent` array; `count` still reports the unlimited total. Algorithm: for every cell where `pack.cells.<field>[k] === source.i`, walk `pack.cells.c[k]` (neighbor cell ids) and collect every distinct neighbor `<field>` value that is neither the source id nor (unless `include_neutrals`) 0. Each adjacent id is resolved to `{i, name}` (unresolvable ids are silently dropped so the list stays clean); adjacent entries are sorted by `i` ascending for deterministic output. Returns `{ok, entity_type, i, name, adjacent: [{i, name}], count}`. Useful for reasoning about political / cultural / religious neighborhoods, drawing diplomatic networks, seeding border conflicts, or finding biome transition zones. Read-only — never mutates pack. Errors on invalid `entity_type`, missing / unresolvable `entity`, non-boolean `include_neutrals`, out-of-range `limit`, or an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
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
            "Positive integer id (non-negative for biome where 0 = Marine) or case-insensitive name / fullName of the source entity.",
        },
        include_neutrals: {
          type: "boolean",
          description:
            "When true, include the id-0 placeholder (Neutrals / Wildlands / No religion) in the adjacent set if it touches. Default false. No-op for biome (Marine is id 0 and always resolves).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_ADJACENT_ENTITIES_LIMIT,
          description: `Maximum adjacent entities to return (default ${DEFAULT_FIND_ADJACENT_ENTITIES_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["entity_type", "entity"],
    },
    execute(rawInput: unknown): ToolResult {
      const args = (rawInput ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
        include_neutrals?: unknown;
        limit?: unknown;
      };

      const type = parseEntityType(args.entity_type);
      if (!type) {
        return errorResult(
          `entity_type must be one of ${ADJACENT_ENTITY_TYPES.map((t) => `'${t}'`).join(", ")}.`,
        );
      }

      const refParsed = parseRef(args.entity, type);
      if (!refParsed.ok) return errorResult(refParsed.error);

      const includeNeutrals = parseIncludeNeutrals(args.include_neutrals);
      if (typeof includeNeutrals === "string") {
        return errorResult(includeNeutrals);
      }

      const limit = parseLimit(args.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.collect(
        type,
        refParsed.ref,
        includeNeutrals,
        limit,
      );
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
        adjacent: result.adjacent,
        count: result.count,
      });
    },
  };
}

export const findAdjacentEntitiesTool = createFindAdjacentEntitiesTool();
