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

export type LockableEntityType =
  | "state"
  | "burg"
  | "culture"
  | "religion"
  | "province";

export const LOCKABLE_TYPES: LockableEntityType[] = [
  "state",
  "burg",
  "culture",
  "religion",
  "province",
];

const typeResolver = createAliasResolver<LockableEntityType>(LOCKABLE_TYPES, {
  states: "state",
  burgs: "burg",
  city: "burg",
  cities: "burg",
  town: "burg",
  towns: "burg",
  cultures: "culture",
  religions: "religion",
  faith: "religion",
  faiths: "religion",
  provinces: "province",
});

export function resolveLockableType(value: unknown): LockableEntityType | null {
  return typeResolver(value);
}

export interface EntityLockRef {
  type: LockableEntityType;
  i: number;
  name: string;
  previousLocked: boolean;
}

export interface EntityLockRuntime {
  find(type: LockableEntityType, ref: number | string): EntityLockRef | null;
  setLock(type: LockableEntityType, i: number, locked: boolean): void;
}

const COLLECTION_KEY: Record<LockableEntityType, keyof Pack> = {
  state: "states",
  burg: "burgs",
  culture: "cultures",
  religion: "religions",
  province: "provinces",
};

function getLockCollection(
  type: LockableEntityType,
): (EntityLike & { lock?: boolean; removed?: boolean })[] | undefined {
  const pack = getPack<Pack>();
  return pack?.[COLLECTION_KEY[type]] as
    | (EntityLike & { lock?: boolean; removed?: boolean })[]
    | undefined;
}

export const defaultEntityLockRuntime: EntityLockRuntime = {
  find(type, ref) {
    const collection = getLockCollection(type);
    const entry = findEntityByRef(collection, ref);
    if (!entry) return null;
    return {
      type,
      i: entry.i,
      name: entry.name ?? "",
      previousLocked: !!entry.lock,
    };
  },
  setLock(type, i, locked) {
    const collection = getLockCollection(type);
    const entry = collection?.[i];
    if (!entry) throw new Error(`${type} ${i} not found.`);
    if (entry.removed) throw new Error(`${type} ${i} has been removed.`);
    entry.lock = locked;
  },
};

export function createSetEntityLockTool(
  runtime: EntityLockRuntime = defaultEntityLockRuntime,
): Tool {
  return {
    name: "set_entity_lock",
    description: `Lock or unlock a state, burg, culture, religion, or province. Locked entities are preserved across map regeneration (the generator won't rename, re-colour, or re-expand them). Idempotent — a no-op if the entity is already in the requested state. Supported types: ${LOCKABLE_TYPES.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [...LOCKABLE_TYPES],
          description: `One of: ${LOCKABLE_TYPES.join(", ")} (case-insensitive; plurals and common synonyms accepted).`,
        },
        entity: {
          type: ["integer", "string"],
          description:
            "Numeric id (> 0) or case-insensitive name matching the entity.",
        },
        locked: {
          type: "boolean",
          description: "true to lock, false to unlock.",
        },
      },
      required: ["type", "entity", "locked"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        type?: unknown;
        entity?: unknown;
        locked?: unknown;
      };

      const type = resolveLockableType(input.type);
      if (!type) {
        return errorResult(
          `type must be one of: ${LOCKABLE_TYPES.join(", ")}.`,
          { supported: [...LOCKABLE_TYPES] },
        );
      }

      const refResult = parseEntityRef(input.entity, "entity");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.locked !== "boolean") {
        return errorResult("locked must be a boolean.");
      }

      const current = runtime.find(type, refResult.ref);
      if (!current) {
        return errorResult(
          `No ${type} found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(`Cannot lock ${type} 0 (the placeholder entry).`);
      }

      if (current.previousLocked === input.locked) {
        return okResult({
          type,
          i: current.i,
          name: current.name,
          locked: input.locked,
          previousLocked: current.previousLocked,
          noop: true,
        });
      }

      try {
        runtime.setLock(type, current.i, input.locked);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        type,
        i: current.i,
        name: current.name,
        locked: input.locked,
        previousLocked: current.previousLocked,
        noop: false,
      });
    },
  };
}

export const setEntityLockTool = createSetEntityLockTool();
