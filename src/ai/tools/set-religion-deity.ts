import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ReligionDeityRef {
  i: number;
  name: string;
  previousDeity: string | null;
}

export interface ReligionDeityRuntime {
  find(ref: number | string): ReligionDeityRef | null;
  apply(i: number, deity: string): void;
}

export const defaultReligionDeityRuntime: ReligionDeityRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousDeity: typeof entry.deity === "string" ? entry.deity : null,
    };
  },
  apply(i: number, deity: string): void {
    const religions = getPackCollection<RawReligion>("religions");
    const religion = religions?.[i];
    if (!religion) throw new Error(`Religion ${i} not found.`);
    if (religion.removed) throw new Error(`Religion ${i} has been removed.`);
    religion.deity = deity;
  },
};

function isWhitespaceOnly(s: string): boolean {
  return s.length > 0 && s.trim().length === 0;
}

export function createSetReligionDeityTool(
  runtime: ReligionDeityRuntime = defaultReligionDeityRuntime,
): Tool {
  return {
    name: "set_religion_deity",
    description:
      "Name or clear a religion's supreme deity (free-form text — same as the Religions Editor deity input). '' clears the deity; whitespace-only strings are rejected. Matches by id (>0) or case-insensitive current name. The 'No religion' placeholder (id 0) is rejected.",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
        deity: {
          type: "string",
          description:
            "Supreme deity name. Pass '' to clear (matches how Folk religions may have no named deity).",
        },
      },
      required: ["religion", "deity"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        deity?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.deity !== "string") {
        return errorResult("deity must be a string.");
      }
      if (isWhitespaceOnly(input.deity)) {
        return errorResult(
          "deity must be '' to clear or contain non-whitespace characters.",
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
          "Cannot set deity on religion 0 (the 'No religion' placeholder).",
        );
      }

      const deity = input.deity === "" ? "" : input.deity.trim();
      try {
        runtime.apply(current.i, deity);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousDeity: current.previousDeity,
        deity,
      });
    },
  };
}

export const setReligionDeityTool = createSetReligionDeityTool();
