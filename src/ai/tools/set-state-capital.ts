import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface StateCapitalState {
  i: number;
  name: string;
  previousCapitalId: number;
  previousCapitalName: string | null;
}

export interface StateCapitalBurg {
  i: number;
  name: string;
  state: number;
  cell: number;
  alreadyCapital: boolean;
}

export interface PromoteInput {
  stateId: number;
  oldCapitalId: number;
  newCapitalId: number;
  newCenterCell: number;
}

export interface StateCapitalRuntime {
  findState(ref: number | string): StateCapitalState | null;
  findBurg(ref: number | string): StateCapitalBurg | null;
  promote(input: PromoteInput): void;
}

interface BurgsModule {
  changeGroup?: (burg: unknown, ...rest: unknown[]) => void;
}

export const defaultStateCapitalRuntime: StateCapitalRuntime = {
  findState(ref) {
    const states = getPackCollection<RawState>("states");
    const burgs = getPackCollection<RawBurg>("burgs");
    const entry = findEntityByRef(states, ref);
    if (!entry) return null;
    const prevId = typeof entry.capital === "number" ? entry.capital : 0;
    const prevName = prevId > 0 ? (burgs?.[prevId]?.name ?? null) : null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousCapitalId: prevId,
      previousCapitalName: prevName,
    };
  },
  findBurg(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      state: typeof entry.state === "number" ? entry.state : 0,
      cell: typeof entry.cell === "number" ? entry.cell : 0,
      alreadyCapital: !!entry.capital,
    };
  },
  promote({
    stateId,
    oldCapitalId,
    newCapitalId,
    newCenterCell,
  }: PromoteInput): void {
    const states = getPackCollection<RawState>("states");
    const burgs = getPackCollection<RawBurg>("burgs");
    const state = states?.[stateId];
    if (!state) throw new Error(`State ${stateId} not found.`);
    const newCapital = burgs?.[newCapitalId];
    if (!newCapital) throw new Error(`Burg ${newCapitalId} not found.`);
    state.capital = newCapitalId;
    state.center = newCenterCell;
    newCapital.capital = 1;
    const oldCapital = oldCapitalId > 0 ? burgs?.[oldCapitalId] : undefined;
    if (oldCapital) oldCapital.capital = 0;
    const burgsModule = getGlobal<BurgsModule>("Burgs");
    const changeGroup = burgsModule?.changeGroup;
    if (typeof changeGroup === "function") {
      try {
        changeGroup(newCapital);
        if (oldCapital) changeGroup(oldCapital);
      } catch {
        // Best-effort visual refresh; data mutation has already happened.
      }
    }
  },
};

export function createSetStateCapitalTool(
  runtime: StateCapitalRuntime = defaultStateCapitalRuntime,
): Tool {
  return {
    name: "set_state_capital",
    description:
      "Promote a different burg to be a state's capital (same side-effect as ticking the Capital checkbox in the Burg Editor). The burg must already belong to the target state. Updates pack.states[i].capital and .center, toggles burg.capital on both old and new capitals, and asks the Burgs module to refresh icon groups. Idempotent: requesting the current capital returns a noop.",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description: "State id (> 0) or case-insensitive name/fullName.",
        },
        burg: {
          type: ["integer", "string"],
          description:
            "Burg id (> 0) or case-insensitive name. Must belong to the target state.",
        },
      },
      required: ["state", "burg"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        burg?: unknown;
      };

      const stateRefResult = parseEntityRef(input.state, "state");
      if (!stateRefResult.ok) return errorResult(stateRefResult.error);
      const burgRefResult = parseEntityRef(input.burg, "burg");
      if (!burgRefResult.ok) return errorResult(burgRefResult.error);

      const state = runtime.findState(stateRefResult.ref);
      if (!state) {
        return errorResult(
          `No state found matching ${JSON.stringify(stateRefResult.ref)}.`,
        );
      }
      if (state.i <= 0) {
        return errorResult(
          "Cannot set capital on state 0 (the Neutrals placeholder).",
        );
      }

      const burg = runtime.findBurg(burgRefResult.ref);
      if (!burg) {
        return errorResult(
          `No burg found matching ${JSON.stringify(burgRefResult.ref)}.`,
        );
      }
      if (burg.i <= 0) {
        return errorResult(
          "Cannot use burg 0 (the placeholder entry) as a capital.",
        );
      }
      if (burg.state !== state.i) {
        return errorResult(
          `Burg ${burg.i} (${JSON.stringify(burg.name)}) is not in state ${state.i} (${JSON.stringify(state.name)}). Reassign the burg first or pick another.`,
        );
      }

      if (burg.alreadyCapital && state.previousCapitalId === burg.i) {
        return okResult({
          state: { i: state.i, name: state.name },
          previousCapital: {
            id: state.previousCapitalId,
            name: state.previousCapitalName,
          },
          capital: { id: burg.i, name: burg.name },
          noop: true,
        });
      }

      try {
        runtime.promote({
          stateId: state.i,
          oldCapitalId: state.previousCapitalId,
          newCapitalId: burg.i,
          newCenterCell: burg.cell,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        state: { i: state.i, name: state.name },
        previousCapital: {
          id: state.previousCapitalId,
          name: state.previousCapitalName,
        },
        capital: { id: burg.i, name: burg.name },
        noop: false,
      });
    },
  };
}

export const setStateCapitalTool = createSetStateCapitalTool();
