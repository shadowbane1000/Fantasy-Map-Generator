import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithCells {
  cells?: { burg?: number[]; state?: number[] };
  burgs?: RawBurg[];
  states?: RawState[];
}

export interface MoveBurgRef {
  i: number;
  name: string;
  previousX: number;
  previousY: number;
  previousCell: number;
  previousState: number;
  isCapital: boolean;
}

export interface MoveBurgCellInfo {
  cellId: number;
  cellState: number;
}

export interface MoveBurgRuntime {
  find(ref: number | string): MoveBurgRef | null;
  findCell(x: number, y: number): MoveBurgCellInfo | null;
  cellOccupiedBy(cellId: number): number;
  move(
    ref: MoveBurgRef,
    x: number,
    y: number,
    cellId: number,
    newState: number,
  ): void;
}

export const defaultMoveBurgRuntime: MoveBurgRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPack<PackWithCells>()?.burgs, ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousX: entry.x ?? 0,
      previousY: entry.y ?? 0,
      previousCell: entry.cell ?? 0,
      previousState: typeof entry.state === "number" ? entry.state : 0,
      isCapital: !!entry.capital,
    };
  },
  findCell(x, y) {
    const fn = getGlobal<(x: number, y: number) => number>("findCell");
    if (typeof fn !== "function") return null;
    const cellId = fn(x, y);
    if (!Number.isFinite(cellId)) return null;
    const stateAt = getPack<PackWithCells>()?.cells?.state?.[cellId] ?? 0;
    return { cellId, cellState: stateAt };
  },
  cellOccupiedBy(cellId) {
    const burgCells = getPack<PackWithCells>()?.cells?.burg;
    if (!Array.isArray(burgCells)) return 0;
    const occupant = burgCells[cellId];
    return typeof occupant === "number" ? occupant : 0;
  },
  move(ref, x, y, cellId, newState) {
    const pack = getPack<PackWithCells>();
    const burgs = pack?.burgs;
    const burg = burgs?.[ref.i];
    if (!burg) throw new Error(`Burg ${ref.i} not found.`);
    const burgCells = pack?.cells?.burg;
    if (Array.isArray(burgCells)) {
      if (ref.previousCell > 0 && burgCells[ref.previousCell] === ref.i) {
        burgCells[ref.previousCell] = 0;
      }
      burgCells[cellId] = ref.i;
    }
    burg.cell = cellId;
    burg.x = x;
    burg.y = y;
    burg.state = newState;
    if (burg.capital) {
      const state = pack?.states?.[newState];
      if (state) state.center = cellId;
    }
    const drawIcon = getGlobal<(burg: RawBurg) => void>("drawBurgIcon");
    if (typeof drawIcon === "function") {
      try {
        drawIcon(burg);
      } catch {
        // Best-effort.
      }
    }
    const drawLabel = getGlobal<(burg: RawBurg) => void>("drawBurgLabel");
    if (typeof drawLabel === "function") {
      try {
        drawLabel(burg);
      } catch {
        // Best-effort.
      }
    }
  },
};

export function createMoveBurgTool(
  runtime: MoveBurgRuntime = defaultMoveBurgRuntime,
): Tool {
  return {
    name: "move_burg",
    description:
      "Relocate a burg to a new cell — same side-effect as the Burg Editor's Relocate button. Uses findCell(x, y) to compute the target cell, validates that no other burg occupies it, and — if the burg is a state capital — that the target cell belongs to the same state (matches the UI's 'Capital cannot be relocated into another state' guard). Writes pack.cells.burg at both old and new cells, updates burg.cell / x / y / state, and (for capitals) pack.states[state].center. Best-effort calls drawBurgIcon and drawBurgLabel so the on-map icon + label move. Idempotent (noop when the coordinates already match).",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or current name.",
        },
        x: {
          type: "number",
          description: "New x coordinate (finite number).",
        },
        y: {
          type: "number",
          description: "New y coordinate (finite number).",
        },
      },
      required: ["burg", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        x?: unknown;
        y?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.x !== "number" || !Number.isFinite(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (typeof input.y !== "number" || !Number.isFinite(input.y)) {
        return errorResult("y must be a finite number.");
      }
      const x = input.x;
      const y = input.y;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousX === x && current.previousY === y) {
        return okResult({
          i: current.i,
          name: current.name,
          x,
          y,
          cell: current.previousCell,
          state: current.previousState,
          previousX: current.previousX,
          previousY: current.previousY,
          previousCell: current.previousCell,
          previousState: current.previousState,
          noop: true,
        });
      }

      const cellInfo = runtime.findCell(x, y);
      if (!cellInfo) {
        return errorResult(
          "findCell is not available yet; the map hasn't finished loading.",
        );
      }

      const occupant = runtime.cellOccupiedBy(cellInfo.cellId);
      if (occupant > 0 && occupant !== current.i) {
        return errorResult(
          `Target cell ${cellInfo.cellId} is already occupied by burg ${occupant}.`,
        );
      }

      if (current.isCapital && cellInfo.cellState !== current.previousState) {
        return errorResult(
          "Capital cannot be relocated into another state — demote it first via set_state_capital.",
        );
      }

      try {
        runtime.move(current, x, y, cellInfo.cellId, cellInfo.cellState);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        x,
        y,
        cell: cellInfo.cellId,
        state: cellInfo.cellState,
        previousX: current.previousX,
        previousY: current.previousY,
        previousCell: current.previousCell,
        previousState: current.previousState,
        noop: false,
      });
    },
  };
}

export const moveBurgTool = createMoveBurgTool();
