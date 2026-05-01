import { rn } from "../../utils/numberUtils";
import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  type Pack,
  parseEntityRef,
  type RawBurg,
  type RawCoa,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  EMBLEM_ENTITY_TYPES,
  type EmblemEntityType,
  resolveEmblemEntityType,
} from "./set-emblem-size";

export interface EmblemPositionRef {
  i: number;
  name: string;
  previousX: number | null;
  previousY: number | null;
}

export interface SetEmblemPositionRuntime {
  find(
    entityType: EmblemEntityType,
    ref: number | string,
  ): EmblemPositionRef | null;
  apply(
    entityType: EmblemEntityType,
    i: number,
    x: number | null,
    y: number | null,
  ): void;
}

interface CoaRendererModule {
  trigger?: (id: string, coa: RawCoa) => unknown;
}

type EntityWithCoa = RawState | RawProvince | RawBurg;

function pickCollection(
  pack: Pack | undefined,
  entityType: EmblemEntityType,
): EntityWithCoa[] | undefined {
  if (!pack) return undefined;
  if (entityType === "state") return pack.states as EntityWithCoa[] | undefined;
  if (entityType === "province")
    return pack.provinces as EntityWithCoa[] | undefined;
  return pack.burgs as EntityWithCoa[] | undefined;
}

function readAxis(
  entity: EntityWithCoa | undefined,
  axis: "x" | "y",
): number | null {
  const coa = entity?.coa as (RawCoa & { x?: number; y?: number }) | undefined;
  const value = coa ? coa[axis] : undefined;
  return typeof value === "number" ? value : null;
}

function titleCase(entityType: EmblemEntityType): string {
  return `${entityType[0]?.toUpperCase()}${entityType.slice(1)}`;
}

export const defaultSetEmblemPositionRuntime: SetEmblemPositionRuntime = {
  find(entityType, ref) {
    const pack = getPack<Pack>();
    const collection = pickCollection(pack, entityType);
    const entry = findEntityByRef(collection, ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousX: readAxis(entry, "x"),
      previousY: readAxis(entry, "y"),
    };
  },
  apply(entityType, i, x, y) {
    const pack = getPack<Pack>();
    if (!pack) {
      throw new Error(
        "window.pack is not available; the map hasn't finished loading.",
      );
    }
    const collection = pickCollection(pack, entityType);
    const entity = collection?.[i];
    if (!entity) {
      throw new Error(`${titleCase(entityType)} ${i} not found.`);
    }

    if (x === null && y === null) {
      // CLEAR: only delete if a coa exists; do NOT initialize one.
      if (entity.coa) {
        const coa = entity.coa as RawCoa & { x?: number; y?: number };
        delete coa.x;
        delete coa.y;
      }
    } else {
      // SET: initialize coa if missing, then write both axes.
      entity.coa = (entity.coa ?? {}) as RawCoa;
      const coa = entity.coa as RawCoa & { x?: number; y?: number };
      coa.x = x as number;
      coa.y = y as number;
    }

    try {
      if (!entity.coa) return;
      const renderer = getGlobal<CoaRendererModule>("COArenderer");
      if (renderer && typeof renderer.trigger === "function") {
        const id = `${entityType}COA${i}`;
        renderer.trigger(id, entity.coa);
      }
    } catch {
      // best-effort — DOM/renderer work must never block the data write
    }
  },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function createSetEmblemPositionTool(
  runtime: SetEmblemPositionRuntime = defaultSetEmblemPositionRuntime,
): Tool {
  return {
    name: "set_emblem_position",
    description: `Set or clear the per-entity coat-of-arms position override (\`entity.coa.x\` / \`entity.coa.y\`) for a single state, province, or burg — same data effect as dragging the emblem in the per-entity Emblem Editor (\`dragEmblem\` end-handler). When both \`x\` and \`y\` are finite numbers the override is written (rounded to 2 decimals); when both are \`null\` the override is cleared via \`delete\` so the renderer falls back to the entity's own \`x\`/\`y\`/\`pole\`. Setting only one axis is rejected — the legacy drag always writes both, so partial state would be ambiguous. Other coa fields (shield, size, custom, charges, …) are preserved. Initialises \`entity.coa = {}\` when the entity has no coa yet AND a SET is requested; CLEAR on an entity with no coa is a no-op (does NOT create one). Best-effort: calls \`COArenderer.trigger("<type>COA<i>", entity.coa)\` to refresh the symbol.`,
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: [...EMBLEM_ENTITY_TYPES],
          description:
            "Which kind of entity owns the emblem: 'state', 'province', or 'burg'.",
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Numeric id (> 0) of the entity, or its case-insensitive name.",
        },
        x: {
          type: ["number", "null"],
          description:
            "Override x coordinate (finite number) or null to clear. Must be both-numbers or both-null with y.",
        },
        y: {
          type: ["number", "null"],
          description:
            "Override y coordinate (finite number) or null to clear. Must be both-numbers or both-null with x.",
        },
      },
      required: ["entity_type", "entity", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
        x?: unknown;
        y?: unknown;
      };

      const entityType = resolveEmblemEntityType(input.entity_type);
      if (!entityType) {
        return errorResult(
          "entity_type must be one of: state, province, burg.",
        );
      }

      const refResult = parseEntityRef(input.entity, "entity");
      if (!refResult.ok) return errorResult(refResult.error);

      const xIsNull = input.x === null;
      const yIsNull = input.y === null;
      const xIsNum = isFiniteNumber(input.x);
      const yIsNum = isFiniteNumber(input.y);

      const bothNull = xIsNull && yIsNull;
      const bothNum = xIsNum && yIsNum;
      if (!bothNull && !bothNum) {
        return errorResult("x and y must be both numbers or both null.");
      }

      const current = runtime.find(entityType, refResult.ref);
      if (!current) {
        return errorResult(
          `${titleCase(entityType)} ${refResult.ref} not found.`,
        );
      }

      const previousX = current.previousX;
      const previousY = current.previousY;

      const xVal: number | null = bothNum ? rn(input.x as number, 2) : null;
      const yVal: number | null = bothNum ? rn(input.y as number, 2) : null;

      try {
        runtime.apply(entityType, current.i, xVal, yVal);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        entity_type: entityType,
        entity: { i: current.i, name: current.name },
        previous_x: previousX,
        previous_y: previousY,
        x: xVal,
        y: yVal,
      });
    },
  };
}

export const setEmblemPositionTool = createSetEmblemPositionTool();
