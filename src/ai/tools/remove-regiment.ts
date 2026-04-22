import {
  errorResult,
  getNotes,
  getPack,
  isActive,
  okResult,
  type RawNote,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";
import { findRegimentByRef } from "./rename-regiment";

export interface RemoveRegimentRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
}

export interface RegimentRemovalRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): RemoveRegimentRef | null;
  remove(stateId: number, i: number): void;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultRegimentRemovalRuntime: RegimentRemovalRuntime = {
  find(stateRef, regRef) {
    const pack = getPack<BurgPackLike>();
    const stateId = resolveStateRefInPack(pack, stateRef);
    if (stateId === null) return null;
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) return null;
    const regiment = findRegimentByRef(state.military, regRef);
    if (!regiment) return null;
    return {
      stateId,
      stateName: state.name ?? "",
      i: regiment.i,
      name: regiment.name ?? "",
    };
  },
  remove(stateId: number, i: number): void {
    const pack = getPack<BurgPackLike>();
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) {
      throw new Error(`State ${stateId} not found.`);
    }
    const military = state.military;
    if (!Array.isArray(military)) {
      throw new Error(`State ${stateId} has no military array.`);
    }
    const idx = military.findIndex((r) => r && r.i === i);
    if (idx < 0) {
      throw new Error(`Regiment ${i} not found in state ${stateId}.`);
    }
    military.splice(idx, 1);
    const notes = getNotes<RawNote>();
    if (Array.isArray(notes)) {
      const noteId = `regiment${stateId}-${i}`;
      const noteIdx = notes.findIndex((n) => n && n.id === noteId);
      if (noteIdx !== -1) notes.splice(noteIdx, 1);
    }
    if (typeof document !== "undefined") {
      document.getElementById(`regiment${stateId}-${i}`)?.remove();
    }
  },
};

export function createRemoveRegimentTool(
  runtime: RegimentRemovalRuntime = defaultRegimentRemovalRuntime,
): Tool {
  return {
    name: "remove_regiment",
    description:
      "Disband a regiment — same side-effect as the Regiment Editor's Remove button. The interactive confirm dialog is skipped (tools run non-interactively). Splices the entry out of pack.states[stateId].military, drops any matching note from window.notes, and removes the #regiment{stateId}-{i} SVG element. Regiment ids are per-state, so pass both `state` (id or case-insensitive name/fullName) and `regiment` (id or case-insensitive current regiment name within that state).",
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
      },
      required: ["state", "regiment"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        regiment?: unknown;
      };

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

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;
      const current = runtime.find(stateRef, regRef);
      if (!current) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      try {
        runtime.remove(current.stateId, current.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: current.stateId,
        stateName: current.stateName,
        i: current.i,
        name: current.name,
      });
    },
  };
}

export const removeRegimentTool = createRemoveRegimentTool();
