import {
  createAliasResolver,
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const STATE_TYPES = [
  "Generic",
  "River",
  "Lake",
  "Naval",
  "Nomadic",
  "Hunting",
  "Highland",
] as const;

export type StateType = (typeof STATE_TYPES)[number];

const resolveStateTypeAlias = createAliasResolver<StateType>(STATE_TYPES);

export function resolveStateType(value: unknown): StateType | null {
  return resolveStateTypeAlias(value);
}

export interface StateTypeRef {
  i: number;
  name: string;
  previousType: string | null;
}

export interface StateTypeRuntime {
  find(ref: number | string): StateTypeRef | null;
  apply(i: number, type: StateType): void;
}

export const defaultStateTypeRuntime: StateTypeRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousType: entry.type ?? null,
    };
  },
  apply(i: number, type: StateType): void {
    const state = getPackCollection<RawState>("states")?.[i];
    if (!state) throw new Error(`State ${i} not found.`);
    if (state.removed) throw new Error(`State ${i} has been removed.`);
    state.type = type;
    const recalc = getGlobal<() => void>("recalculateStates");
    if (typeof recalc === "function") {
      try {
        recalc();
      } catch {
        // Best-effort: mutation already happened.
      }
    }
  },
};

export function createSetStateTypeTool(
  runtime: StateTypeRuntime = defaultStateTypeRuntime,
): Tool {
  return {
    name: "set_state_type",
    description: `Change a state's type — same side-effect as the States Editor type dropdown. Writes state.type and calls recalculateStates() so cells redistribute per type-specific expansion rules. One of: ${STATE_TYPES.join(", ")} (case-insensitive; same 7-value enum as burgs and cultures). Neutrals (state 0) is rejected.`,
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Numeric state id (> 0) or case-insensitive current name.",
        },
        type: {
          type: "string",
          description: `One of: ${STATE_TYPES.join(", ")} (case-insensitive).`,
        },
      },
      required: ["state", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        type?: unknown;
      };

      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.type !== "string" || !input.type.trim()) {
        return errorResult("type must be a non-empty string.", {
          supported: [...STATE_TYPES],
        });
      }
      const resolved = resolveStateType(input.type);
      if (!resolved) {
        return errorResult(
          `Unknown state type: ${JSON.stringify(input.type)}.`,
          { supported: [...STATE_TYPES] },
        );
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set type on state 0 (the Neutrals placeholder).",
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

export const setStateTypeTool = createSetStateTypeTool();
