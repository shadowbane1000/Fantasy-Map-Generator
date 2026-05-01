import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  getPackCollection,
  okResult,
  type Pack,
  parseEntityRef,
  type RawBurg,
  type RawCoa,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { CULTURE_SHIELDS, resolveCultureShield } from "./set-culture-shield";

export type EmblemShieldEntityType = "state" | "province" | "burg";

export interface EmblemShieldRef {
  i: number;
  name: string;
  previousShield: string | null;
}

export interface EmblemShieldRuntime {
  find(
    entityType: EmblemShieldEntityType,
    ref: number | string,
  ): EmblemShieldRef | null;
  apply(entityType: EmblemShieldEntityType, i: number, shield: string): void;
}

interface CoaRendererModule {
  trigger?: (id: string, coa: RawCoa) => unknown;
}

const TYPE_TO_COLLECTION: Record<EmblemShieldEntityType, keyof Pack> = {
  state: "states",
  province: "provinces",
  burg: "burgs",
};

const TYPE_TO_TITLE: Record<EmblemShieldEntityType, string> = {
  state: "State",
  province: "Province",
  burg: "Burg",
};

type EntityForType<T extends EmblemShieldEntityType> = T extends "state"
  ? RawState
  : T extends "province"
    ? RawProvince
    : RawBurg;

function lookupEntity(
  type: EmblemShieldEntityType,
  ref: number | string,
): { i: number; name: string; coa: RawCoa | undefined } | null {
  if (type === "state") {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
    if (!entry || entry.i <= 0) return null;
    return { i: entry.i, name: entry.name ?? "", coa: entry.coa };
  }
  if (type === "province") {
    const entry = findEntityByRef(
      getPackCollection<RawProvince>("provinces"),
      ref,
    );
    if (!entry || entry.i <= 0) return null;
    return { i: entry.i, name: entry.name ?? "", coa: entry.coa };
  }
  const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
  if (!entry || entry.i <= 0) return null;
  return { i: entry.i, name: entry.name ?? "", coa: entry.coa };
}

export const defaultEmblemShieldRuntime: EmblemShieldRuntime = {
  find(entityType, ref) {
    const entry = lookupEntity(entityType, ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name,
      previousShield:
        typeof entry.coa?.shield === "string" ? entry.coa.shield : null,
    };
  },
  apply(entityType, i, shield) {
    const pack = getPack<Pack>();
    if (!pack) {
      throw new Error(
        "window.pack is not available; the map hasn't finished loading.",
      );
    }
    const collectionKey = TYPE_TO_COLLECTION[entityType];
    const collection = pack[collectionKey];
    if (!Array.isArray(collection)) {
      throw new Error(`pack.${collectionKey} is not available.`);
    }
    const entity = (collection as EntityForType<typeof entityType>[])[i];
    if (!entity) {
      throw new Error(`${TYPE_TO_TITLE[entityType]} ${i} not found.`);
    }
    if (!entity.coa) entity.coa = {};
    entity.coa.shield = shield;
    try {
      const id = `${entityType}COA${i}`;
      if (typeof document !== "undefined") {
        const existing = document.getElementById(id);
        if (existing && typeof existing.remove === "function") {
          existing.remove();
        }
      }
      const renderer = getGlobal<CoaRendererModule>("COArenderer");
      if (renderer && typeof renderer.trigger === "function") {
        renderer.trigger(id, entity.coa);
      }
    } catch {
      // best-effort — DOM work must never block the mutation
    }
  },
};

function parseEntityType(value: unknown): EmblemShieldEntityType | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (key === "state" || key === "province" || key === "burg") return key;
  return null;
}

export function createSetEmblemShieldTool(
  runtime: EmblemShieldRuntime = defaultEmblemShieldRuntime,
): Tool {
  return {
    name: "set_emblem_shield",
    description: `Set the heraldic shield shape for a single state, province, or burg coat-of-arms — same side-effect as the "Shape" select in the per-entity Emblem Editor (legacy \`changeShape\`). Mutates only \`entity.coa.shield\`; every other coa field (tinctures, charges, ordinaries, size, custom flag, …) is preserved. Best-effort: removes the existing \`#${"<type>"}COA${"<i>"}\` DOM node and calls \`COArenderer.trigger(id, coa)\` to redraw. Initialises \`entity.coa = {}\` when the entity has no coa yet (e.g. neutral burgs that have never been emblem-edited). Refuses entity 0 (placeholder) and removed entities. Complements \`set_default_emblem_shape\` (global default) and \`set_culture_shield\` (cascades across all of a culture's non-custom entities). Use \`list_emblem_shapes\` for the full list of recognized shield names (~40 shapes — heater, swiss, oval, square, noldor, fantasy1, …).`,
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: ["state", "province", "burg"],
          description: "Which collection the entity belongs to.",
        },
        entity: {
          type: ["integer", "string"],
          description: "Numeric id (> 0) or case-insensitive name.",
        },
        shield: {
          type: "string",
          description:
            "One of the recognized shield names (e.g. 'heater', 'oval', 'square'). Use list_emblem_shapes for the full set.",
        },
      },
      required: ["entity_type", "entity", "shield"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        entity_type?: unknown;
        entity?: unknown;
        shield?: unknown;
      };

      const entityType = parseEntityType(input.entity_type);
      if (!entityType) {
        return errorResult(
          "entity_type must be one of: state, province, burg.",
        );
      }

      const refResult = parseEntityRef(input.entity, "entity");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.shield !== "string" || !input.shield.trim()) {
        return errorResult("shield must be a non-empty string.", {
          supported: [...CULTURE_SHIELDS],
        });
      }
      const shape = resolveCultureShield(input.shield);
      if (!shape) {
        return errorResult(
          `Unknown shield '${input.shield}'. Valid shields: ${CULTURE_SHIELDS.join(", ")}.`,
          { supported: [...CULTURE_SHIELDS] },
        );
      }

      const current = runtime.find(entityType, refResult.ref);
      if (!current) {
        return errorResult(
          `${TYPE_TO_TITLE[entityType]} ${refResult.ref} not found.`,
        );
      }

      const previousShield = current.previousShield;

      try {
        runtime.apply(entityType, current.i, shape);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        entity_type: entityType,
        entity: { i: current.i, name: current.name },
        previous_shield: previousShield,
        shield: shape,
      });
    },
  };
}

export const setEmblemShieldTool = createSetEmblemShieldTool();
