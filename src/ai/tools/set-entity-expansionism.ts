import {
  createAliasResolver,
  type EntityLike,
  errorResult,
  findEntityByRef,
  getPack,
  okResult,
  type Pack,
  parseEntityRef,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type ExpansionableType = "state" | "culture" | "religion";

export const EXPANSIONABLE_TYPES: ExpansionableType[] = [
  "state",
  "culture",
  "religion",
];

const typeResolver = createAliasResolver<ExpansionableType>(
  EXPANSIONABLE_TYPES,
  {
    states: "state",
    cultures: "culture",
    religions: "religion",
    faith: "religion",
    faiths: "religion",
  },
);

export function resolveExpansionableType(
  value: unknown,
): ExpansionableType | null {
  return typeResolver(value);
}

export interface EntityExpansionismRef {
  type: ExpansionableType;
  i: number;
  name: string;
  previousExpansionism: number;
}

export interface EntityExpansionismRuntime {
  find(
    type: ExpansionableType,
    ref: number | string,
  ): EntityExpansionismRef | null;
  apply(type: ExpansionableType, i: number, expansionism: number): void;
}

const COLLECTION_KEY: Record<ExpansionableType, keyof Pack> = {
  state: "states",
  culture: "cultures",
  religion: "religions",
};

function getExpansionismCollection(
  type: ExpansionableType,
): (EntityLike & { expansionism?: number; removed?: boolean })[] | undefined {
  const pack = getPack<Pack>();
  return pack?.[COLLECTION_KEY[type]] as
    | (EntityLike & { expansionism?: number; removed?: boolean })[]
    | undefined;
}

export const defaultEntityExpansionismRuntime: EntityExpansionismRuntime = {
  find(type, ref) {
    const entry = findEntityByRef(getExpansionismCollection(type), ref);
    if (!entry) return null;
    return {
      type,
      i: entry.i,
      name: entry.name ?? "",
      previousExpansionism:
        typeof entry.expansionism === "number" ? entry.expansionism : 1,
    };
  },
  apply(type, i, expansionism) {
    const collection = getExpansionismCollection(type);
    const entry = collection?.[i];
    if (!entry) throw new Error(`${type} ${i} not found.`);
    if (entry.removed) throw new Error(`${type} ${i} has been removed.`);
    entry.expansionism = expansionism;
  },
};

const MAX_EXPANSIONISM = 100;

export function createSetEntityExpansionismTool(
  runtime: EntityExpansionismRuntime = defaultEntityExpansionismRuntime,
): Tool {
  return {
    name: "set_entity_expansionism",
    description: `Tune a state / culture / religion's expansionism — how aggressively it expands during regeneration. Values are finite floats in (0, ${MAX_EXPANSIONISM}]; typical range 0.5–5. Passive: the value is read by the next regenerate_map. Supported types: ${EXPANSIONABLE_TYPES.join(", ")} (plurals and 'faith' also accepted).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [...EXPANSIONABLE_TYPES],
          description: `One of: ${EXPANSIONABLE_TYPES.join(", ")} (case-insensitive; plurals / 'faith' accepted).`,
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Numeric id (> 0) or case-insensitive name of the entity.",
        },
        expansionism: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: MAX_EXPANSIONISM,
          description: `Finite positive number in (0, ${MAX_EXPANSIONISM}]. Higher = more aggressive expansion.`,
        },
      },
      required: ["type", "entity", "expansionism"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        type?: unknown;
        entity?: unknown;
        expansionism?: unknown;
      };

      const type = resolveExpansionableType(input.type);
      if (!type) {
        return errorResult(
          `type must be one of: ${EXPANSIONABLE_TYPES.join(", ")}.`,
          { supported: [...EXPANSIONABLE_TYPES] },
        );
      }

      const refResult = parseEntityRef(input.entity, "entity");
      if (!refResult.ok) return errorResult(refResult.error);
      if (
        typeof input.expansionism !== "number" ||
        !Number.isFinite(input.expansionism) ||
        input.expansionism <= 0 ||
        input.expansionism > MAX_EXPANSIONISM
      ) {
        return errorResult(
          `expansionism must be a finite number in (0, ${MAX_EXPANSIONISM}].`,
        );
      }

      const current = runtime.find(type, refResult.ref);
      if (!current) {
        return errorResult(
          `No ${type} found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          `Cannot set expansionism on ${type} 0 (the placeholder entry).`,
        );
      }

      try {
        runtime.apply(type, current.i, input.expansionism);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        type,
        i: current.i,
        name: current.name,
        previousExpansionism: current.previousExpansionism,
        expansionism: input.expansionism,
      });
    },
  };
}

export const setEntityExpansionismTool = createSetEntityExpansionismTool();
