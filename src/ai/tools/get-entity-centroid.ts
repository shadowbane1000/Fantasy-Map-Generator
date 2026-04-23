import {
  type EntityLike,
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
} from "./_shared";
import {
  ADJACENT_ENTITY_TYPES,
  type AdjacentEntityType,
} from "./find-adjacent-entities";
import type { Tool, ToolResult } from "./index";
import { findBiomeByRef } from "./rename-biome";

interface ArrayLikeReadonly<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  cells?: {
    i?: ArrayLikeReadonly<number>;
    p?: ArrayLikeReadonly<ArrayLikeReadonly<number>>;
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

export interface EntityCentroid {
  x: number;
  y: number;
}

export interface EntityCentroidHit {
  i: number;
  name: string;
  centroid: EntityCentroid | null;
  cellsCount: number;
}

export type CollectEntityCentroidResult =
  | EntityCentroidHit
  | "not-ready"
  | "unknown-entity";

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

interface ResolvedEntity {
  i: number;
  name: string;
}

function resolveEntity(
  pack: PackLike,
  biomesData: BiomesDataLike | undefined,
  type: AdjacentEntityType,
  ref: number | string,
): ResolvedEntity | null {
  if (type === "biome") {
    const res = findBiomeByRef(biomesData, ref);
    if (!res) return null;
    return { i: res.id, name: res.name };
  }
  const entity = findEntityByRef(getCollection(pack, type), ref);
  if (!entity) return null;
  return { i: entity.i, name: entity.name ?? "" };
}

/**
 * Pure collector: given the world state (`pack`, optional `biomesData`
 * for biome lookups), an entity type, and a ref, return the entity's
 * center of mass — the arithmetic mean of every cell's centroid
 * (`pack.cells.p[k]`) for cells whose per-cell field value equals
 * the resolved entity's id. Returns `centroid: null` when the entity
 * resolves but has zero cells or when `pack.cells.<field>` is missing.
 * Returns `"not-ready"` when pack / pack.cells.i is missing, and
 * `"unknown-entity"` when the ref does not resolve.
 */
export function computeEntityCentroid(
  pack: PackLike | undefined,
  biomesData: BiomesDataLike | undefined,
  type: AdjacentEntityType,
  ref: number | string,
): CollectEntityCentroidResult {
  if (!pack || !pack.cells || !pack.cells.i) return "not-ready";

  const resolved = resolveEntity(pack, biomesData, type, ref);
  if (!resolved) return "unknown-entity";

  const field = getCellField(pack, type);
  const points = pack.cells.p;
  const cellsI = pack.cells.i;

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  if (field && points) {
    const targetId = resolved.i;
    const len = cellsI.length;
    for (let k = 0; k < len; k++) {
      if (field[k] !== targetId) continue;
      const pt = points[k];
      if (!pt || typeof pt.length !== "number" || pt.length < 2) continue;
      const x = pt[0];
      const y = pt[1];
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sumX += x;
      sumY += y;
      count++;
    }
  }

  const centroid: EntityCentroid | null =
    count > 0 ? { x: sumX / count, y: sumY / count } : null;

  return {
    i: resolved.i,
    name: resolved.name,
    centroid,
    cellsCount: count,
  };
}

export interface GetEntityCentroidRuntime {
  compute(
    type: AdjacentEntityType,
    ref: number | string,
  ): CollectEntityCentroidResult;
}

export const defaultGetEntityCentroidRuntime: GetEntityCentroidRuntime = {
  compute(type, ref) {
    return computeEntityCentroid(
      getPack<PackLike>(),
      getGlobal<BiomesDataLike>("biomesData"),
      type,
      ref,
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

export function createGetEntityCentroidTool(
  runtime: GetEntityCentroidRuntime = defaultGetEntityCentroidRuntime,
): Tool {
  return {
    name: "get_entity_centroid",
    description:
      "Compute the center-of-mass (arithmetic mean of every member cell's centroid `pack.cells.p[k] = [x, y]`) of a state / province / culture / religion / biome — the 'typical center' parallel of `get_entity_cells` (which lists the cells) and complementary to a bbox midpoint (which is biased by a territory's shape; the centroid is not). Required `entity_type` (case-insensitive, one of 'state', 'province', 'culture', 'religion', 'biome') and `entity` (positive integer id — non-negative for biome where 0 = Marine — OR case-insensitive name / fullName; resolved via the shared `findEntityByRef` for the first four types and `findBiomeByRef` for biomes, skipping the index-0 placeholder / `removed: true` entries / the `'removed'` biome sentinel). Algorithm: iterates `pack.cells.<field>` (field = state/province/culture/religion/biome) and, for every cell `k` with `field[k] === entity.i`, reads `pack.cells.p[k]` and accumulates `sumX`, `sumY`, `count`; malformed points (missing / non-numeric / non-finite) are silently skipped so they don't poison the average. Returns `{ok, entity_type, i, name, centroid: {x, y} | null, cells_count}`. `centroid` is `null` (not an error) when the entity resolves but has zero cells (or when `pack.cells.<field>` is absent); `cells_count` always reports how many member cells contributed to the mean. Useful for placing labels / markers at a territory's typical center, aiming `focus_on_map` or `set_state_capital` candidates, distance queries between territories, or pairing with `find_cells_in_radius({cell: ...})` to audit around a region's heart. Read-only — never mutates pack. Errors on invalid `entity_type`, missing / unresolvable `entity`, or an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          description:
            "Which entity collection to target: 'state', 'province', 'culture', 'religion', or 'biome' (case-insensitive).",
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Positive integer id (non-negative for biome where 0 = Marine) or case-insensitive name / fullName of the entity.",
        },
      },
      required: ["entity_type", "entity"],
    },
    execute(rawInput: unknown): ToolResult {
      const args = (rawInput ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
      };

      const type = parseEntityType(args.entity_type);
      if (!type) {
        return errorResult(
          `entity_type must be one of ${ADJACENT_ENTITY_TYPES.map((t) => `'${t}'`).join(", ")}.`,
        );
      }

      const refParsed = parseRef(args.entity, type);
      if (!refParsed.ok) return errorResult(refParsed.error);

      const result = runtime.compute(type, refParsed.ref);
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
        centroid: result.centroid,
        cells_count: result.cellsCount,
      });
    },
  };
}

export const getEntityCentroidTool = createGetEntityCentroidTool();
