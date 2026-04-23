import {
  createAliasResolver,
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const RELIGION_EXPANSIONS = ["global", "state", "culture"] as const;
export type ReligionExpansion = (typeof RELIGION_EXPANSIONS)[number];

const resolveExpansionAlias =
  createAliasResolver<ReligionExpansion>(RELIGION_EXPANSIONS);

export function resolveReligionExpansion(
  value: unknown,
): ReligionExpansion | null {
  return resolveExpansionAlias(value);
}

export interface ReligionExpansionRef {
  i: number;
  name: string;
  previousExpansion: string | null;
}

export interface ReligionExpansionRuntime {
  find(ref: number | string): ReligionExpansionRef | null;
  apply(i: number, expansion: ReligionExpansion): void;
}

export const defaultReligionExpansionRuntime: ReligionExpansionRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousExpansion: entry.expansion ?? null,
    };
  },
  apply(i, expansion) {
    const religions = getPackCollection<RawReligion>("religions");
    const religion = religions?.[i];
    if (!religion) throw new Error(`Religion ${i} not found.`);
    if (religion.removed) throw new Error(`Religion ${i} has been removed.`);
    religion.expansion = expansion;
    const recalc = getGlobal<() => void>("recalculateReligions");
    if (typeof recalc === "function") {
      try {
        recalc();
      } catch {
        // Best-effort: mutation already landed.
      }
    }
  },
};

export function createSetReligionExpansionTool(
  runtime: ReligionExpansionRuntime = defaultReligionExpansionRuntime,
): Tool {
  return {
    name: "set_religion_expansion",
    description: `Change a religion's expansion extent — same side-effect as the Religions Editor Extent dropdown. Writes religion.expansion and best-effort calls recalculateReligions() so cells redistribute. One of: ${RELIGION_EXPANSIONS.join(", ")} (case-insensitive). The "No religion" placeholder (id 0) and removed religions are rejected. Idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
        expansion: {
          type: "string",
          enum: [...RELIGION_EXPANSIONS],
          description: `One of: ${RELIGION_EXPANSIONS.join(", ")} (case-insensitive).`,
        },
      },
      required: ["religion", "expansion"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        expansion?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.expansion !== "string" || !input.expansion.trim()) {
        return errorResult("expansion must be a non-empty string.", {
          supported: [...RELIGION_EXPANSIONS],
        });
      }
      const resolved = resolveReligionExpansion(input.expansion);
      if (!resolved) {
        return errorResult(
          `Unknown religion expansion: ${JSON.stringify(input.expansion)}.`,
          { supported: [...RELIGION_EXPANSIONS] },
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
          "Cannot set expansion on religion 0 (the 'No religion' placeholder).",
        );
      }

      if (current.previousExpansion === resolved) {
        return okResult({
          i: current.i,
          name: current.name,
          previousExpansion: current.previousExpansion,
          expansion: resolved,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, resolved);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousExpansion: current.previousExpansion,
        expansion: resolved,
        noop: false,
      });
    },
  };
}

export const setReligionExpansionTool = createSetReligionExpansionTool();
