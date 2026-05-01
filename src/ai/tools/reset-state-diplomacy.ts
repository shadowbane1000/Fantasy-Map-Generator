import { errorResult, getPack, isActive, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";

export interface ResetStateDiplomacyChange {
  other_state: { i: number; name: string };
  previous: string;
  new: "Neutral";
}

export interface ResetStateDiplomacyResult {
  state: { i: number; name: string };
  changes: ResetStateDiplomacyChange[];
}

export interface ResetStateDiplomacyError {
  error: string;
}

export interface ResetStateDiplomacyRuntime {
  reset(
    ref: number | string,
  ): ResetStateDiplomacyResult | ResetStateDiplomacyError;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultResetStateDiplomacyRuntime: ResetStateDiplomacyRuntime = {
  reset(ref) {
    const pack = getPack<BurgPackLike>();
    const id = resolveStateRefInPack(pack, ref);
    if (id === null) {
      return { error: `State ${JSON.stringify(ref)} not found.` };
    }
    if (id === 0) {
      return {
        error: "Cannot reset diplomacy for state 0 (the Neutrals placeholder).",
      };
    }
    const state = pack?.states?.[id];
    if (!state || !isActive(state)) {
      return { error: `Cannot reset diplomacy for removed state ${id}.` };
    }
    const dip = (state as { diplomacy?: unknown }).diplomacy;
    const stateName = state.name ?? "";
    if (!Array.isArray(dip)) {
      return { state: { i: id, name: stateName }, changes: [] };
    }

    const changes: ResetStateDiplomacyChange[] = [];
    for (let j = 0; j < dip.length; j++) {
      if (dip[j] === "x") continue;
      if (j === id) continue;
      if (j <= 0) continue;
      const other = pack?.states?.[j];
      if (!other || other.removed) continue;
      const otherDip = (other as { diplomacy?: unknown }).diplomacy;
      if (!Array.isArray(otherDip)) continue;
      const previous = dip[j];
      if (previous === "Neutral") continue;
      dip[j] = "Neutral";
      otherDip[id] = "Neutral";
      changes.push({
        other_state: { i: j, name: other.name ?? "" },
        previous: String(previous),
        new: "Neutral",
      });
    }

    return { state: { i: id, name: stateName }, changes };
  },
};

export function createResetStateDiplomacyTool(
  runtime: ResetStateDiplomacyRuntime = defaultResetStateDiplomacyRuntime,
): Tool {
  return {
    name: "reset_state_diplomacy",
    description:
      'Reset a single state\'s diplomatic relations with every other state to Neutral — same as the Reset button in the Diplomacy editor. Mirrors the change on the counterpart side. The "x" diagonal and slots involving state 0 / removed states are preserved. Pairs that are already Neutral are left untouched. Returns the per-pair changes that were actually applied.',
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or the state's current name (case-insensitive name / fullName).",
        },
      },
      required: ["state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { state?: unknown };
      if (!isValidRef(input.state)) {
        return errorResult(
          "state must be a positive integer id or a non-empty name string.",
        );
      }
      const ref = input.state as number | string;
      const out = runtime.reset(ref);
      if ("error" in out) {
        return errorResult(out.error);
      }
      return okResult({
        state: out.state,
        changes: out.changes,
      });
    },
  };
}

export const resetStateDiplomacyTool = createResetStateDiplomacyTool();
