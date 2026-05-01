import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Per-cell state assignment override — mirrors the per-polygon write
 * inside `applyStatesManualAssignent` in
 * `public/modules/dynamic/editors/states-editor.js`
 * (around lines 975-989):
 *
 *   cells.state[i] = c;
 *   if (cells.burg[i]) pack.burgs[cells.burg[i]].state = c;
 *
 * `pack.cells.state` and `pack.cells.burg` are typed arrays
 * (Uint8Array / Uint16Array depending on map size). Direct scalar
 * mutation; best-effort calls `drawStates()` to refresh the layer.
 * Does NOT trigger `recalculate_states`, `States.getPoles()`,
 * `adjustProvinces`, `drawBorders`, `drawProvinces` or
 * `drawStateLabels` — the tool stays atomic so callers can compose
 * it freely. Peer to `set_cell_biome` / `set_cell_culture` /
 * `set_cell_religion` / `set_cell_height`.
 */

type CellNumberArrayLike = ArrayLike<number> & {
  [i: number]: number;
  length: number;
};

interface PackLike {
  cells?: {
    state?: CellNumberArrayLike;
    burg?: CellNumberArrayLike;
  };
  states?: RawState[];
  burgs?: RawBurg[];
}

export interface CellStateRuntime {
  getCellStates(): CellNumberArrayLike | null;
  setCellState(cell: number, state: number): void;
  getStates(): RawState[] | null;
  getCellBurgs(): CellNumberArrayLike | null;
  getBurgs(): RawBurg[] | null;
  setBurgState(burgId: number, state: number): void;
  drawStates(): void;
}

export const defaultCellStateRuntime: CellStateRuntime = {
  getCellStates(): CellNumberArrayLike | null {
    const arr = getPack<PackLike>()?.cells?.state;
    if (!arr || typeof arr.length !== "number") return null;
    return arr;
  },
  setCellState(cell: number, state: number): void {
    const arr = getPack<PackLike>()?.cells?.state;
    if (!arr || typeof arr.length !== "number") {
      throw new Error(
        "window.pack.cells.state is not available; the map hasn't finished loading.",
      );
    }
    arr[cell] = state;
  },
  getStates(): RawState[] | null {
    const states = getPack<PackLike>()?.states;
    if (!Array.isArray(states)) return null;
    return states;
  },
  getCellBurgs(): CellNumberArrayLike | null {
    const arr = getPack<PackLike>()?.cells?.burg;
    if (!arr || typeof arr.length !== "number") return null;
    return arr;
  },
  getBurgs(): RawBurg[] | null {
    const burgs = getPack<PackLike>()?.burgs;
    if (!Array.isArray(burgs)) return null;
    return burgs;
  },
  setBurgState(burgId: number, state: number): void {
    const burgs = getPack<PackLike>()?.burgs;
    if (!Array.isArray(burgs)) {
      throw new Error(
        "window.pack.burgs is not available; the map hasn't finished loading.",
      );
    }
    const burg = burgs[burgId];
    if (!burg) return;
    burg.state = state;
  },
  drawStates(): void {
    const fn = getGlobal<() => void>("drawStates");
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch {
      // Best-effort: the data mutation already happened.
    }
  },
};

function validateNonNegativeInteger(
  name: string,
  raw: unknown,
): number | string {
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    !Number.isInteger(raw) ||
    raw < 0
  ) {
    return `${name} must be a non-negative integer.`;
  }
  return raw;
}

export function createSetCellStateTool(
  runtime: CellStateRuntime = defaultCellStateRuntime,
): Tool {
  return {
    name: "set_cell_state",
    description:
      'Override the political state assignment of a single packed-grid cell — writes `pack.cells.state[cell] = state` and, if the cell holds a burg (`pack.cells.burg[cell] > 0`), also updates `pack.burgs[burgId].state` to keep the burg and the cell it sits in consistent (otherwise legend / diplomacy / state-summary calculations break). Best-effort calls `drawStates()`. Same primitive side-effect as one stroke of the States Editor\'s Manual-mode brush (`applyStatesManualAssignent` per-polygon write). Required `cell` (integer, 0 to `pack.cells.state.length - 1` — packed-grid index in `pack.cells`). Required `state` (integer state id; index into `pack.states`; `0` = the "Neutrals" placeholder is allowed and means unowned land). Atomic primitive: does NOT call `recalculate_states`, `States.getPoles()`, `adjustProvinces`, `drawBorders`, `drawProvinces` or `drawStateLabels` — caller can chain `recalculate_states` if propagation is needed. Peer to `set_cell_biome`, `set_cell_culture`, `set_cell_religion`, `set_cell_height`. Returns `{cell, previous_state, previous_state_name, state, state_name, burg, burg_name, burg_previous_state}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        cell: {
          type: "integer",
          minimum: 0,
          description: "Cell index in pack.cells (0-based).",
        },
        state: {
          type: "integer",
          minimum: 0,
          description: "State id (0 = Neutrals).",
        },
      },
      required: ["cell", "state"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        cell?: unknown;
        state?: unknown;
      };

      const cell = validateNonNegativeInteger("cell", input.cell);
      if (typeof cell === "string") return errorResult(cell);

      const state = validateNonNegativeInteger("state", input.state);
      if (typeof state === "string") return errorResult(state);

      const cellStates = runtime.getCellStates();
      if (!cellStates) {
        return errorResult(
          "window.pack.cells.state is not available; the map hasn't finished loading.",
        );
      }

      const states = runtime.getStates();
      if (!states) {
        return errorResult(
          "window.pack.states is not available; the map hasn't finished loading.",
        );
      }

      const cellBurgs = runtime.getCellBurgs();
      if (!cellBurgs) {
        return errorResult(
          "window.pack.cells.burg is not available; the map hasn't finished loading.",
        );
      }

      const burgs = runtime.getBurgs();
      if (!burgs) {
        return errorResult(
          "window.pack.burgs is not available; the map hasn't finished loading.",
        );
      }

      if (cell >= cellStates.length) {
        return errorResult(
          `cell ${cell} is out of range (max ${cellStates.length - 1}).`,
        );
      }

      if (state >= states.length) {
        return errorResult(
          `state ${state} is not a valid state id (max ${states.length - 1}).`,
        );
      }

      const stateEntry = states[state];
      if (!stateEntry || stateEntry.removed === true) {
        return errorResult(`State ${state} has been removed.`);
      }

      const previous = cellStates[cell];
      const previousStateName = states[previous]?.name ?? "";
      const stateName = stateEntry.name ?? "";

      let burgId: number | null = null;
      let burgName: string | null = null;
      let burgPreviousState: number | null = null;
      let burgEntry: RawBurg | undefined;

      const burgIdRaw = cellBurgs[cell];
      if (burgIdRaw > 0) {
        burgId = burgIdRaw;
        burgEntry = burgs[burgIdRaw];
        burgName = burgEntry?.name ?? "";
        burgPreviousState =
          burgEntry && typeof burgEntry.state === "number"
            ? burgEntry.state
            : null;
      }

      try {
        runtime.setCellState(cell, state);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (burgId !== null && burgEntry) {
        try {
          runtime.setBurgState(burgId, state);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      }

      try {
        runtime.drawStates();
      } catch {
        // Best-effort: data mutation already succeeded.
      }

      return okResult({
        cell,
        previous_state: previous,
        previous_state_name: previousStateName,
        state,
        state_name: stateName,
        burg: burgId,
        burg_name: burgName,
        burg_previous_state: burgPreviousState,
      });
    },
  };
}

export const setCellStateTool = createSetCellStateTool();
