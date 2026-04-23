import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawCulture,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

function findCultureByRef(
  cultures: RawCulture[] | undefined,
  ref: number | string,
): RawCulture | null {
  if (!Array.isArray(cultures)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0) return null;
    if (ref === 0) {
      const wildlands = cultures[0];
      if (!wildlands || wildlands.removed) return null;
      return wildlands;
    }
    return findEntityByRef(cultures, ref);
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const c of cultures) {
    if (!c || c.removed) continue;
    if ((c.name ?? "").toLowerCase() === needle) return c;
  }
  return null;
}

export interface ReligionCultureRef {
  i: number;
  name: string;
  previousCultureId: number;
  previousCultureName: string | null;
}

export interface CultureTarget {
  i: number;
  name: string;
}

export interface ReligionCultureRuntime {
  findReligion(ref: number | string): ReligionCultureRef | null;
  findCulture(ref: number | string): CultureTarget | null;
  apply(religionId: number, cultureId: number): void;
}

export const defaultReligionCultureRuntime: ReligionCultureRuntime = {
  findReligion(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
      ref,
    );
    if (!entry) return null;
    const prevId = typeof entry.culture === "number" ? entry.culture : 0;
    const cultures = getPackCollection<RawCulture>("cultures");
    const prevName = cultures?.[prevId]?.name ?? null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousCultureId: prevId,
      previousCultureName: prevName,
    };
  },
  findCulture(ref) {
    const entry = findCultureByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    return { i: entry.i, name: entry.name ?? "" };
  },
  apply(religionId: number, cultureId: number): void {
    const religion = getPackCollection<RawReligion>("religions")?.[religionId];
    if (!religion) throw new Error(`Religion ${religionId} not found.`);
    if (religion.removed)
      throw new Error(`Religion ${religionId} has been removed.`);
    const culture = getPackCollection<RawCulture>("cultures")?.[cultureId];
    if (!culture) throw new Error(`Culture ${cultureId} not found.`);
    if (culture.removed)
      throw new Error(`Culture ${cultureId} has been removed.`);
    religion.culture = cultureId;
  },
};

function isValidCultureRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createSetReligionCultureTool(
  runtime: ReligionCultureRuntime = defaultReligionCultureRuntime,
): Tool {
  return {
    name: "set_religion_culture",
    description:
      "Change a religion's associated / origin culture — the parent-culture anchor used by `Religions.getDeityName(cultureId)` when regenerating deities. Writes pack.religions[i].culture. Religion accepts id (>0) or case-insensitive name; culture accepts id (0 = Wildlands is allowed) or case-insensitive name. Rejects the 'No religion' placeholder (id 0) and removed religions / cultures. No visual redraw (the Religions Editor doesn't expose a per-row culture selector; the field is data-layer metadata).",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (> 0) or case-insensitive current name.",
        },
        culture: {
          type: ["integer", "string"],
          description:
            "Culture id (0 = Wildlands is allowed) or case-insensitive name.",
        },
      },
      required: ["religion", "culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        culture?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
      if (!refResult.ok) return errorResult(refResult.error);
      if (!isValidCultureRef(input.culture)) {
        return errorResult(
          "culture must be a non-negative integer id or a non-empty name string.",
        );
      }

      const cultureRef = input.culture as number | string;

      const religion = runtime.findReligion(refResult.ref);
      if (!religion) {
        return errorResult(
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (religion.i <= 0) {
        return errorResult(
          "Cannot set culture on religion 0 (the 'No religion' placeholder).",
        );
      }

      const culture = runtime.findCulture(cultureRef);
      if (!culture) {
        return errorResult(
          `No culture found matching ${JSON.stringify(cultureRef)}.`,
        );
      }

      try {
        runtime.apply(religion.i, culture.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: religion.i,
        name: religion.name,
        previousCulture: {
          id: religion.previousCultureId,
          name: religion.previousCultureName,
        },
        culture: { id: culture.i, name: culture.name },
      });
    },
  };
}

export const setReligionCultureTool = createSetReligionCultureTool();
