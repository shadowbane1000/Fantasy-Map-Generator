import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface BurgRef {
  i: number;
  name: string;
  previousCultureId: number;
}

export interface CultureRef {
  id: number;
  name: string;
}

export interface BurgCultureRuntime {
  findBurg(ref: number | string): BurgRef | null;
  findCulture(ref: number | string): CultureRef | null;
  setCulture(burgId: number, cultureId: number): void;
}

function readWildlandsName(): string {
  return getPackCollection<RawCulture>("cultures")?.[0]?.name ?? "Wildlands";
}

function isWildlandsRef(ref: number | string): boolean {
  if (ref === 0) return true;
  if (typeof ref !== "string") return false;
  const key = ref.trim().toLowerCase();
  return key === "wildlands" || key === "0";
}

export const defaultBurgCultureRuntime: BurgCultureRuntime = {
  findBurg(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousCultureId: typeof entry.culture === "number" ? entry.culture : 0,
    };
  },
  findCulture(ref) {
    if (isWildlandsRef(ref)) {
      return { id: 0, name: readWildlandsName() };
    }
    const entry = findEntityByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    return { id: entry.i, name: entry.name ?? "" };
  },
  setCulture(burgId: number, cultureId: number): void {
    const burgs = getPackCollection<RawBurg>("burgs");
    const b = burgs?.[burgId];
    if (!b) throw new Error(`Burg ${burgId} not found.`);
    if (b.removed) throw new Error(`Burg ${burgId} has been removed.`);
    b.culture = cultureId;
  },
};

export function createSetBurgCultureTool(
  runtime: BurgCultureRuntime = defaultBurgCultureRuntime,
): Tool {
  return {
    name: "set_burg_culture",
    description:
      "Reassign a burg to a different culture. Both refs accept a numeric id or a case-insensitive name. Wildlands (culture 0) is allowed as a target — the Burg Editor also allows it. Updates pack.burgs[i].culture; no map redraw needed since the culture link is metadata.",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description:
            "Numeric burg id (> 0) or current case-insensitive name.",
        },
        culture: {
          type: ["integer", "string"],
          description:
            "Culture id (0 = Wildlands is allowed) or case-insensitive name.",
        },
      },
      required: ["burg", "culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        culture?: unknown;
      };

      const burgRefResult = parseEntityRef(input.burg, "burg");
      if (!burgRefResult.ok) return errorResult(burgRefResult.error);

      const cultureRefValid =
        (typeof input.culture === "number" &&
          Number.isInteger(input.culture) &&
          input.culture >= 0) ||
        (typeof input.culture === "string" && input.culture.trim());
      if (!cultureRefValid) {
        return errorResult(
          "culture must be a non-negative integer id or a non-empty name string.",
        );
      }

      const cultureRef = input.culture as number | string;

      const burg = runtime.findBurg(burgRefResult.ref);
      if (!burg) {
        return errorResult(
          `No burg found matching ${JSON.stringify(burgRefResult.ref)}.`,
        );
      }
      if (burg.i <= 0) {
        return errorResult(
          "Cannot change culture on burg 0 (the placeholder entry).",
        );
      }

      const culture = runtime.findCulture(cultureRef);
      if (!culture) {
        return errorResult(
          `No culture found matching ${JSON.stringify(cultureRef)}.`,
        );
      }

      const previousCulture = runtime.findCulture(burg.previousCultureId);

      try {
        runtime.setCulture(burg.i, culture.id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: burg.i,
        name: burg.name,
        previousCulture: {
          id: burg.previousCultureId,
          name: previousCulture?.name ?? null,
        },
        culture: { id: culture.id, name: culture.name },
      });
    },
  };
}

export const setBurgCultureTool = createSetBurgCultureTool();
