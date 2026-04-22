import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  type Pack,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { fallbackAbbreviate } from "./rename-culture";

export interface ReligionRef {
  i: number;
  name: string;
  code: string | null;
}

export interface RenameReligionResult {
  code: string;
}

export interface ReligionMutationRuntime {
  find(ref: number | string): ReligionRef | null;
  rename(i: number, name: string): RenameReligionResult;
}

export function findReligionForRenameInPack(
  pack: Pack | undefined,
  ref: number | string,
): ReligionRef | null {
  const entry = findEntityByRef(pack?.religions, ref);
  if (!entry) return null;
  return { i: entry.i, name: entry.name ?? "", code: entry.code ?? null };
}

export const defaultReligionMutationRuntime: ReligionMutationRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    return { i: entry.i, name: entry.name ?? "", code: entry.code ?? null };
  },
  rename(i: number, name: string): RenameReligionResult {
    const religions = getPackCollection<RawReligion>("religions");
    const target = religions?.[i];
    if (!target) throw new Error(`Religion ${i} not found.`);
    if (target.removed) throw new Error(`Religion ${i} has been removed.`);
    const others =
      religions
        ?.filter((r) => r && r.i !== i && !r.removed)
        .map((r) => r.code ?? "")
        .filter(Boolean) ?? [];
    const abbrev = getGlobal<(n: string, r: string[]) => string>("abbreviate");
    const code =
      typeof abbrev === "function"
        ? abbrev(name, others)
        : fallbackAbbreviate(name, others);
    target.name = name;
    target.code = code;
    return { code };
  },
};

export function createRenameReligionTool(
  runtime: ReligionMutationRuntime = defaultReligionMutationRuntime,
): Tool {
  return {
    name: "rename_religion",
    description:
      "Rename a specific religion by id (from list_religions) or by its current case-insensitive name. Regenerates the religion's short code via the same abbreviation algorithm the Religions Editor uses. Rejects the index-0 'No religion' placeholder.",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or the religion's current name.",
        },
        name: {
          type: "string",
          description: "The new name for the religion.",
        },
      },
      required: ["religion", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        name?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot rename religion 0 (the 'No religion' placeholder).",
        );
      }

      const newName = input.name.trim();
      let result: RenameReligionResult;
      try {
        result = runtime.rename(current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        previousCode: current.code,
        name: newName,
        code: result.code,
      });
    },
  };
}

export const renameReligionTool = createRenameReligionTool();
