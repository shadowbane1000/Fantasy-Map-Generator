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

export interface RegimentNavalRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
  previousNaval: boolean;
}

export interface RegimentNavalRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): RegimentNavalRef | null;
  apply(stateId: number, i: number, naval: boolean): void;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultRegimentNavalRuntime: RegimentNavalRuntime = {
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
      previousNaval: !!reg.n,
    };
  },
  apply(stateId, i, naval) {
    const pack = getPack<BurgPackLike>();
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) {
      throw new Error(`State ${stateId} not found.`);
    }
    const reg = findRegimentByRef(state.military, i);
    if (!reg) {
      throw new Error(`Regiment ${i} not found in state ${stateId}.`);
    }
    (reg as RawRegiment).n = naval ? 1 : 0;
    const draw = getGlobal<() => void>("drawMilitary");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: data mutation already landed.
      }
    }
  },
};

export function createSetRegimentNavalTool(
  runtime: RegimentNavalRuntime = defaultRegimentNavalRuntime,
): Tool {
  return {
    name: "set_regiment_naval",
    description:
      "Flip a regiment between naval and land — same side-effect as the Regiment Editor's anchor/users type-toggle icon. Writes regiment.n to 1 (naval) or 0 (land), then best-effort calls drawMilitary() so the armies layer redraws with the correct icon + rect width. Regiment ids are per-state, so BOTH state (id or case-insensitive name / fullName) and regiment (numeric regiment.i or case-insensitive current regiment name within the state) are required. Idempotent.",
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
        naval: {
          type: "boolean",
          description:
            "true to mark as naval (reg.n = 1), false to mark as land (reg.n = 0).",
        },
      },
      required: ["state", "regiment", "naval"],
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
      if (typeof input.naval !== "boolean") {
        return errorResult("naval must be a boolean.");
      }

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;
      const naval = input.naval;

      const current = runtime.find(stateRef, regRef);
      if (!current) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      if (current.previousNaval === naval) {
        return okResult({
          stateId: current.stateId,
          stateName: current.stateName,
          i: current.i,
          name: current.name,
          naval,
          previousNaval: current.previousNaval,
          noop: true,
        });
      }

      try {
        runtime.apply(current.stateId, current.i, naval);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: current.stateId,
        stateName: current.stateName,
        i: current.i,
        name: current.name,
        naval,
        previousNaval: current.previousNaval,
        noop: false,
      });
    },
  };
}

export const setRegimentNavalTool = createSetRegimentNavalTool();
