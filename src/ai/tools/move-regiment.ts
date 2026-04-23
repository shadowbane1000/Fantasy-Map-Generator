import {
  errorResult,
  getGlobal,
  getPack,
  isActive,
  okResult,
  type RawRegiment,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";
import { findRegimentByRef } from "./rename-regiment";

export interface MoveRegimentRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
  previousX: number;
  previousY: number;
}

export interface MoveRegimentRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): MoveRegimentRef | null;
  move(stateId: number, i: number, x: number, y: number): void;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultMoveRegimentRuntime: MoveRegimentRuntime = {
  find(stateRef, regRef) {
    const pack = getPack<BurgPackLike>();
    const stateId = resolveStateRefInPack(pack, stateRef);
    if (stateId === null) return null;
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) return null;
    const reg = findRegimentByRef(state.military, regRef);
    if (!reg) return null;
    return {
      stateId,
      stateName: state.name ?? "",
      i: reg.i,
      name: reg.name ?? "",
      previousX: typeof reg.x === "number" ? reg.x : 0,
      previousY: typeof reg.y === "number" ? reg.y : 0,
    };
  },
  move(stateId, i, x, y) {
    const pack = getPack<BurgPackLike>();
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) {
      throw new Error(`State ${stateId} not found.`);
    }
    const reg = findRegimentByRef(state.military, i);
    if (!reg) {
      throw new Error(`Regiment ${i} not found in state ${stateId}.`);
    }
    const moveFn =
      getGlobal<(reg: RawRegiment, x: number, y: number) => void>(
        "moveRegiment",
      );
    if (typeof moveFn === "function") {
      moveFn(reg, x, y);
      return;
    }
    (reg as RawRegiment).x = x;
    (reg as RawRegiment).y = y;
  },
};

export function createMoveRegimentTool(
  runtime: MoveRegimentRuntime = defaultMoveRegimentRuntime,
): Tool {
  return {
    name: "move_regiment",
    description:
      "Relocate a regiment on the armies layer — same side-effect as dragging the regiment in the Regiments layer. Delegates to window.moveRegiment(reg, x, y) which writes reg.x / reg.y and animates the regiment's SVG rect / text / icon / image to the new coords. If the renderer is not available yet, falls back to writing reg.x / reg.y directly. Regiment ids are per-state, so BOTH state (id or case-insensitive name / fullName) and regiment (numeric regiment.i or case-insensitive current regiment name within the state) are required. Idempotent (noop when the coords already match).",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Owning state — numeric id (0 = Neutrals is valid) or case-insensitive state name / fullName.",
        },
        regiment: {
          type: ["integer", "string"],
          description:
            "Numeric regiment id (regiment.i, per-state) or case-insensitive current regiment name within that state.",
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
      required: ["state", "regiment", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;

      if (!isValidRef(input.state)) {
        return errorResult(
          "state must be a non-negative integer id or a non-empty name string.",
        );
      }
      if (!isValidRef(input.regiment)) {
        return errorResult(
          "regiment must be a non-negative integer id or a non-empty name string.",
        );
      }
      if (typeof input.x !== "number" || !Number.isFinite(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (typeof input.y !== "number" || !Number.isFinite(input.y)) {
        return errorResult("y must be a finite number.");
      }

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;
      const x = input.x;
      const y = input.y;

      const current = runtime.find(stateRef, regRef);
      if (!current) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      if (current.previousX === x && current.previousY === y) {
        return okResult({
          stateId: current.stateId,
          stateName: current.stateName,
          i: current.i,
          name: current.name,
          x,
          y,
          previousX: current.previousX,
          previousY: current.previousY,
          noop: true,
        });
      }

      try {
        runtime.move(current.stateId, current.i, x, y);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: current.stateId,
        stateName: current.stateName,
        i: current.i,
        name: current.name,
        x,
        y,
        previousX: current.previousX,
        previousY: current.previousY,
        noop: false,
      });
    },
  };
}

export const moveRegimentTool = createMoveRegimentTool();
