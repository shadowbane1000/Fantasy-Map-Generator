import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  type Pack,
  parseEntityRef,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface CultureRef {
  i: number;
  name: string;
  code: string | null;
}

export interface RenameResult {
  code: string;
}

export interface CultureMutationRuntime {
  find(ref: number | string): CultureRef | null;
  rename(i: number, name: string): RenameResult;
}

export function findCultureForRenameInPack(
  pack: Pack | undefined,
  ref: number | string,
): CultureRef | null {
  const entry = findEntityByRef(pack?.cultures, ref);
  if (!entry) return null;
  return { i: entry.i, name: entry.name ?? "", code: entry.code ?? null };
}

export function fallbackAbbreviate(name: string, restricted: string[]): string {
  const parsed = name.replace("Old ", "O ").replace(/[()]/g, "");
  const words = parsed.split(" ").filter(Boolean);
  const letters = words.join("");
  if (!letters) return "XX";
  let code =
    words.length === 2
      ? (words[0][0] ?? "") + (words[1][0] ?? "")
      : letters.slice(0, 2);
  for (let i = 1; i < letters.length - 1 && restricted.includes(code); i++) {
    code = (letters[0] ?? "") + (letters[i] ?? "").toUpperCase();
  }
  return code;
}

export const defaultCultureMutationRuntime: CultureMutationRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    return { i: entry.i, name: entry.name ?? "", code: entry.code ?? null };
  },
  rename(i: number, name: string): RenameResult {
    const cultures = getPackCollection<RawCulture>("cultures");
    const target = cultures?.[i];
    if (!target) throw new Error(`Culture ${i} not found.`);
    if (target.removed) throw new Error(`Culture ${i} has been removed.`);
    const others =
      cultures
        ?.filter((c) => c && c.i !== i && !c.removed)
        .map((c) => c.code ?? "")
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

export function createRenameCultureTool(
  runtime: CultureMutationRuntime = defaultCultureMutationRuntime,
): Tool {
  return {
    name: "rename_culture",
    description:
      "Rename a specific culture by id (from list_cultures) or by its current case-insensitive name. Regenerates the culture's short code via the same abbreviation algorithm the Cultures Editor uses. Rejects the index-0 Wildlands placeholder.",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (> 0) or the culture's current name.",
        },
        name: {
          type: "string",
          description: "The new name for the culture.",
        },
      },
      required: ["culture", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { culture?: unknown; name?: unknown };

      const refResult = parseEntityRef(input.culture, "culture");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No culture found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot rename culture 0 (the Wildlands placeholder).",
        );
      }

      const newName = input.name.trim();
      let result: RenameResult;
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

export const renameCultureTool = createRenameCultureTool();
