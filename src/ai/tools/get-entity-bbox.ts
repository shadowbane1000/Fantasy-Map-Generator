import {
  type EntityLike,
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
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
    p?: ArrayLikeReadonly<ArrayLikeReadonly<number> | undefined>;
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

export interface Bbox {
  x_min: number | null;
  y_min: number | null;
  x_max: number | null;
  y_max: number | null;
  width: number | null;
  height: number | null;
  cx: number | null;
  cy: number | null;
}

export interface EntityBboxHit {
  i: number;
  name: string;
  bbox: Bbox;
  cells_count: number;
}

export type CollectEntityBboxResult =
  | EntityBboxHit
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

function emptyBbox(): Bbox {
  return {
    x_min: null,
    y_min: null,
    x_max: null,
    y_max: null,
    width: null,
    height: null,
    cx: null,
    cy: null,
  };
}

/**
 * Pure collector: given the world state (`pack`), the biomes dictionary
 * (only used for `type === "biome"`), an entity type, and a ref, walk
 * every cell assigned to the entity and compute the axis-aligned
 * bounding box of their centroids (`pack.cells.p[k]`).
 *
 * Returns `"not-ready"` when pack / `pack.cells.i` / `pack.cells.p`
 * (or biomesData for the biome domain) is missing. Returns
 * `"unknown-entity"` when the ref cannot be resolved. Otherwise returns
 * `{ i, name, bbox, cells_count }` — with every numeric bbox field
 * `null` when no cell matches.
 */
export function collectEntityBbox(
  pack: PackLike | undefined,
  biomesData: BiomesDataLike | undefined,
  type: AdjacentEntityType,
  ref: number | string,
): CollectEntityBboxResult {
  if (!pack || !pack.cells || !pack.cells.i || !pack.cells.p) {
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
  const points = pack.cells.p;

  let xMin = Number.POSITIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let cellsCount = 0;

  if (field) {
    const len = cellsIndex.length;
    for (let k = 0; k < len; k++) {
      if (field[k] !== entityI) continue;
      const p = points[k];
      if (!p || typeof p.length !== "number" || p.length < 2) continue;
      const x = p[0];
      const y = p[1];
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
      cellsCount++;
    }
  }

  if (cellsCount === 0) {
    return { i: entityI, name: entityName, bbox: emptyBbox(), cells_count: 0 };
  }

  const width = xMax - xMin;
  const height = yMax - yMin;
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;

  return {
    i: entityI,
    name: entityName,
    bbox: {
      x_min: xMin,
      y_min: yMin,
      x_max: xMax,
      y_max: yMax,
      width,
      height,
      cx,
      cy,
    },
    cells_count: cellsCount,
  };
}

export interface GetEntityBboxRuntime {
  collect(
    type: AdjacentEntityType,
    ref: number | string,
  ): CollectEntityBboxResult;
}

export const defaultGetEntityBboxRuntime: GetEntityBboxRuntime = {
  collect(type, ref) {
    return collectEntityBbox(
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

export function createGetEntityBboxTool(
  runtime: GetEntityBboxRuntime = defaultGetEntityBboxRuntime,
): Tool {
  return {
    name: "get_entity_bbox",
    description:
      "Compute the axis-aligned bounding box of a state / province / culture / religion / biome by walking the cells assigned to it and reading centroid coordinates from `pack.cells.p`. The bbox parallel of `get_entity_cells` (cell ids) and `find_cells_adjacent_to_entity` (border ring) — collapses coord retrieval into a single call so the AI can skip a `get_cell_info` fan-out. Required `entity_type` (case-insensitive string, one of 'state', 'province', 'culture', 'religion', 'biome') and `entity`. For state / province / culture / religion, `entity` is a positive integer id OR case-insensitive name / fullName (resolved via the shared `findEntityByRef`, skipping the index-0 placeholder and `removed: true` entries). For biome, `entity` is a non-negative integer id (0 = Marine is allowed) OR case-insensitive current biome name (resolved via `findBiomeByRef`; the sentinel `'removed'` slot is skipped). No optional args — bbox is a constant-size payload regardless of cell count. Algorithm: for every cell `k` with `pack.cells.<field>[k] === entity.i` (field = `state`/`province`/`culture`/`religion`/`biome`), read `pack.cells.p[k]` and fold its x/y into the running min/max. When no cell matches, `bbox` returns all-null numeric fields and `cells_count: 0`; when a single cell matches, `width`/`height` are 0 and `cx`/`cy` point at it. Returns `{ ok, entity_type, i, name, bbox: {x_min, y_min, x_max, y_max, width, height, cx, cy}, cells_count }`. Useful for camera focus / fit-to-extent, overlay placement, AI reasoning about territorial shape or concentration, or pre-checks before a localized `find_cells_in_radius`. Read-only — never mutates pack. Errors on invalid `entity_type`, missing / unresolvable `entity`, or an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
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
      },
      required: ["entity_type", "entity"],
    },
    execute(input: unknown): ToolResult {
      const args = (input ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
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

      const result = runtime.collect(type, ref);
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
        bbox: result.bbox,
        cells_count: result.cells_count,
      });
    },
  };
}

export const getEntityBboxTool = createGetEntityBboxTool();
