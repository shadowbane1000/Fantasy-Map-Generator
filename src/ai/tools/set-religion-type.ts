import {
  createAliasResolver,
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const RELIGION_TYPES = ["Folk", "Organized", "Cult", "Heresy"] as const;
export type ReligionType = (typeof RELIGION_TYPES)[number];

const resolveReligionTypeAlias =
  createAliasResolver<ReligionType>(RELIGION_TYPES);

export function resolveReligionType(value: unknown): ReligionType | null {
  return resolveReligionTypeAlias(value);
}

export interface ReligionTypeRef {
  i: number;
  name: string;
  previousType: string | null;
}

export interface ReligionTypeRuntime {
  find(ref: number | string): ReligionTypeRef | null;
  apply(i: number, type: ReligionType): void;
}

export const defaultReligionTypeRuntime: ReligionTypeRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousType: entry.type ?? null,
    };
  },
  apply(i: number, type: ReligionType): void {
    const religions = getPackCollection<RawReligion>("religions");
    const religion = religions?.[i];
    if (!religion) throw new Error(`Religion ${i} not found.`);
    if (religion.removed) throw new Error(`Religion ${i} has been removed.`);
    religion.type = type;
  },
};

export function createSetReligionTypeTool(
  runtime: ReligionTypeRuntime = defaultReligionTypeRuntime,
): Tool {
  return {
    name: "set_religion_type",
    description: `Change a religion's type — same side-effect as the Religions Editor type dropdown. Writes religion.type. One of: ${RELIGION_TYPES.join(", ")} (case-insensitive). The "No religion" placeholder (id 0) is rejected.`,
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
        type: {
          type: "string",
          description: `One of: ${RELIGION_TYPES.join(", ")} (case-insensitive).`,
        },
      },
      required: ["religion", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        type?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.type !== "string" || !input.type.trim()) {
        return errorResult("type must be a non-empty string.", {
          supported: [...RELIGION_TYPES],
        });
      }
      const resolved = resolveReligionType(input.type);
      if (!resolved) {
        return errorResult(
          `Unknown religion type: ${JSON.stringify(input.type)}.`,
          { supported: [...RELIGION_TYPES] },
        );
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set type on religion 0 (the 'No religion' placeholder).",
        );
      }

      try {
        runtime.apply(current.i, resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousType: current.previousType,
        type: resolved,
      });
    },
  };
}

export const setReligionTypeTool = createSetReligionTypeTool();
