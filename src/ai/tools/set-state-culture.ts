import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  type RawCulture,
  type RawState,
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

export interface StateCultureState {
  i: number;
  name: string;
  previousCultureId: number;
  previousCultureName: string | null;
}

export interface StateCultureCulture {
  i: number;
  name: string;
}

export interface StateCultureRuntime {
  findState(ref: number | string): StateCultureState | null;
  findCulture(ref: number | string): StateCultureCulture | null;
  apply(stateId: number, cultureId: number): void;
}

export const defaultStateCultureRuntime: StateCultureRuntime = {
  findState(ref) {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
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
  apply(stateId: number, cultureId: number): void {
    const state = getPackCollection<RawState>("states")?.[stateId];
    if (!state) throw new Error(`State ${stateId} not found.`);
    if (state.removed) throw new Error(`State ${stateId} has been removed.`);
    const culture = getPackCollection<RawCulture>("cultures")?.[cultureId];
    if (!culture) throw new Error(`Culture ${cultureId} not found.`);
    if (culture.removed)
      throw new Error(`Culture ${cultureId} has been removed.`);
    state.culture = cultureId;
  },
};

function isValidStateRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1;
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCultureRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createSetStateCultureTool(
  runtime: StateCultureRuntime = defaultStateCultureRuntime,
): Tool {
  return {
    name: "set_state_culture",
    description:
      "Change a state's dominant culture — same side-effect as the States Editor culture dropdown. Writes pack.states[i].culture. Culture accepts id (including 0 = Wildlands) or case-insensitive name. Rejects Neutrals (state 0).",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description: "State id (> 0) or case-insensitive name / fullName.",
        },
        culture: {
          type: ["integer", "string"],
          description:
            "Culture id (0 = Wildlands is allowed) or case-insensitive name.",
        },
      },
      required: ["state", "culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        culture?: unknown;
      };

      if (!isValidStateRef(input.state)) {
        return errorResult(
          "state must be a positive integer id or a non-empty name string.",
        );
      }
      if (!isValidCultureRef(input.culture)) {
        return errorResult(
          "culture must be a non-negative integer id or a non-empty name string.",
        );
      }

      const stateRef = input.state as number | string;
      const cultureRef = input.culture as number | string;

      const state = runtime.findState(stateRef);
      if (!state) {
        return errorResult(
          `No state found matching ${JSON.stringify(stateRef)}.`,
        );
      }
      const culture = runtime.findCulture(cultureRef);
      if (!culture) {
        return errorResult(
          `No culture found matching ${JSON.stringify(cultureRef)}.`,
        );
      }

      try {
        runtime.apply(state.i, culture.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        state: { i: state.i, name: state.name },
        previousCulture: {
          id: state.previousCultureId,
          name: state.previousCultureName,
        },
        culture: { id: culture.i, name: culture.name },
      });
    },
  };
}

export const setStateCultureTool = createSetStateCultureTool();
