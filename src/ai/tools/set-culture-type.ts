import {
  createAliasResolver,
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const CULTURE_TYPES = [
  "Generic",
  "River",
  "Lake",
  "Naval",
  "Nomadic",
  "Hunting",
  "Highland",
] as const;

export type CultureType = (typeof CULTURE_TYPES)[number];

const resolveCultureTypeAlias = createAliasResolver<CultureType>(CULTURE_TYPES);

export function resolveCultureType(value: unknown): CultureType | null {
  return resolveCultureTypeAlias(value);
}

export interface CultureTypeRef {
  i: number;
  name: string;
  previousType: string | null;
}

export interface CultureTypeRuntime {
  find(ref: number | string): CultureTypeRef | null;
  apply(i: number, type: CultureType): void;
}

export const defaultCultureTypeRuntime: CultureTypeRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousType: entry.type ?? null,
    };
  },
  apply(i: number, type: CultureType): void {
    const cultures = getPackCollection<RawCulture>("cultures");
    const culture = cultures?.[i];
    if (!culture) throw new Error(`Culture ${i} not found.`);
    if (culture.removed) throw new Error(`Culture ${i} has been removed.`);
    culture.type = type;
    const recalc = getGlobal<() => void>("recalculateCultures");
    if (typeof recalc === "function") {
      try {
        recalc();
      } catch {
        // Best-effort: the mutation already happened.
      }
    }
  },
};

export function createSetCultureTypeTool(
  runtime: CultureTypeRuntime = defaultCultureTypeRuntime,
): Tool {
  return {
    name: "set_culture_type",
    description: `Change a culture's type — same side-effect as the Cultures Editor type dropdown. Writes culture.type and calls recalculateCultures() so cells redistribute per type-specific expansion rules (Naval hugs coasts, Nomadic prefers steppe, etc.). One of: ${CULTURE_TYPES.join(", ")} (case-insensitive; same 7-value enum as burg types). Culture 0 (Wildlands) is rejected.`,
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (> 0) or case-insensitive current name.",
        },
        type: {
          type: "string",
          description: `One of: ${CULTURE_TYPES.join(", ")} (case-insensitive).`,
        },
      },
      required: ["culture", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        culture?: unknown;
        type?: unknown;
      };

      const refResult = parseEntityRef(input.culture, "culture");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.type !== "string" || !input.type.trim()) {
        return errorResult("type must be a non-empty string.", {
          supported: [...CULTURE_TYPES],
        });
      }
      const resolved = resolveCultureType(input.type);
      if (!resolved) {
        return errorResult(
          `Unknown culture type: ${JSON.stringify(input.type)}.`,
          { supported: [...CULTURE_TYPES] },
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
          "Cannot set type on culture 0 (the Wildlands placeholder).",
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

export const setCultureTypeTool = createSetCultureTypeTool();
