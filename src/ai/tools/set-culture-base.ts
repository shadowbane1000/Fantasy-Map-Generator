import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NameBase {
  name: string;
}

export function resolveNameBase(
  value: unknown,
  nameBases: NameBase[] | undefined,
): number | null {
  if (!Array.isArray(nameBases)) return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value >= nameBases.length)
      return null;
    return value;
  }
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  for (let k = 0; k < nameBases.length; k++) {
    if ((nameBases[k]?.name ?? "").toLowerCase() === needle) return k;
  }
  return null;
}

export interface CultureBaseRef {
  i: number;
  name: string;
  previousBase: number | null;
  previousBaseName: string | null;
}

export interface CultureBaseRuntime {
  find(ref: number | string): CultureBaseRef | null;
  apply(i: number, base: number): void;
  getNameBases(): NameBase[] | undefined;
}

export const defaultCultureBaseRuntime: CultureBaseRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    const prev = typeof entry.base === "number" ? entry.base : null;
    const nameBases = getGlobal<NameBase[]>("nameBases");
    const prevName =
      prev !== null && Array.isArray(nameBases)
        ? (nameBases[prev]?.name ?? null)
        : null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousBase: prev,
      previousBaseName: prevName,
    };
  },
  apply(i: number, base: number): void {
    const cultures = getPackCollection<RawCulture>("cultures");
    const culture = cultures?.[i];
    if (!culture) throw new Error(`Culture ${i} not found.`);
    if (culture.removed) throw new Error(`Culture ${i} has been removed.`);
    culture.base = base;
  },
  getNameBases() {
    return getGlobal<NameBase[]>("nameBases");
  },
};

export function createSetCultureBaseTool(
  runtime: CultureBaseRuntime = defaultCultureBaseRuntime,
): Tool {
  return {
    name: "set_culture_base",
    description:
      "Set a culture's name-base (language family) — same side-effect as the Cultures Editor name-base dropdown. Writes culture.base (numeric index into window.nameBases). The `base` parameter accepts a numeric index or a case-insensitive base name (e.g. 'German', 'Norse', 'Elven'). Matches culture by id (>0) or case-insensitive name; Wildlands (0) is rejected.",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (> 0) or case-insensitive current name.",
        },
        base: {
          type: ["integer", "string"],
          description:
            "Numeric index into window.nameBases or case-insensitive base name.",
        },
      },
      required: ["culture", "base"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        culture?: unknown;
        base?: unknown;
      };

      const refResult = parseEntityRef(input.culture, "culture");
      if (!refResult.ok) return errorResult(refResult.error);

      const nameBases = runtime.getNameBases();
      if (!Array.isArray(nameBases)) {
        return errorResult(
          "nameBases is not available yet; wait for the map to finish loading.",
        );
      }

      const resolved = resolveNameBase(input.base, nameBases);
      if (resolved === null) {
        return errorResult(
          `base must be a valid index into nameBases or a known base name; got ${JSON.stringify(input.base)}.`,
        );
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No culture found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set base on culture 0 (the Wildlands placeholder).",
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
        previousBase: current.previousBase,
        previousBaseName: current.previousBaseName,
        base: resolved,
        baseName: nameBases[resolved]?.name ?? null,
      });
    },
  };
}

export const setCultureBaseTool = createSetCultureBaseTool();
