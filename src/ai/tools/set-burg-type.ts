import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const BURG_TYPES = [
  "Generic",
  "River",
  "Lake",
  "Naval",
  "Nomadic",
  "Hunting",
  "Highland",
] as const;

export type BurgType = (typeof BURG_TYPES)[number];

const LOOKUP = new Map<string, BurgType>();
for (const t of BURG_TYPES) LOOKUP.set(t.toLowerCase(), t);

export function resolveBurgType(value: unknown): BurgType | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface BurgTypeRef {
  i: number;
  name: string;
  previousType: string | null;
}

export interface BurgTypeRuntime {
  find(ref: number | string): BurgTypeRef | null;
  apply(i: number, type: BurgType): void;
}

export const defaultBurgTypeRuntime: BurgTypeRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousType: entry.type ?? null,
    };
  },
  apply(i: number, type: BurgType): void {
    const burgs = getPackCollection<RawBurg>("burgs");
    const b = burgs?.[i];
    if (!b) throw new Error(`Burg ${i} not found.`);
    if (b.removed) throw new Error(`Burg ${i} has been removed.`);
    b.type = type;
  },
};

export function createSetBurgTypeTool(
  runtime: BurgTypeRuntime = defaultBurgTypeRuntime,
): Tool {
  return {
    name: "set_burg_type",
    description: `Change a burg's type category — affects naming style and icon choice. One of: ${BURG_TYPES.join(", ")}. Accepts numeric burg id or case-insensitive current name. Type resolution is also case-insensitive.`,
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or current name.",
        },
        type: {
          type: "string",
          description: `Burg type: ${BURG_TYPES.join(", ")}.`,
        },
      },
      required: ["burg", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        type?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.type !== "string" || !input.type.trim()) {
        return errorResult("type must be a non-empty string.", {
          supported: [...BURG_TYPES],
        });
      }

      const resolved = resolveBurgType(input.type);
      if (!resolved) {
        return errorResult(
          `Unknown burg type: ${JSON.stringify(input.type)}.`,
          { supported: [...BURG_TYPES] },
        );
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot change type on burg 0 (the placeholder entry).",
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

export const setBurgTypeTool = createSetBurgTypeTool();
