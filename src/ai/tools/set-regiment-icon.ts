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

export interface RegimentIconRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
  previousIcon: string;
}

export interface RegimentIconRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): RegimentIconRef | null;
  apply(stateId: number, i: number, icon: string): void;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultRegimentIconRuntime: RegimentIconRuntime = {
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
      previousIcon: reg.icon ?? "",
    };
  },
  apply(stateId, i, icon) {
    const pack = getPack<BurgPackLike>();
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) {
      throw new Error(`State ${stateId} not found.`);
    }
    const reg = findRegimentByRef(state.military, i);
    if (!reg) {
      throw new Error(`Regiment ${i} not found in state ${stateId}.`);
    }
    (reg as RawRegiment).icon = icon;
    const draw = getGlobal<() => void>("drawMilitary");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort.
      }
    }
  },
};

export function createSetRegimentIconTool(
  runtime: RegimentIconRuntime = defaultRegimentIconRuntime,
): Tool {
  return {
    name: "set_regiment_icon",
    description:
      "Change a regiment's icon — same side-effect as the Regiment Editor's emblem picker. Writes regiment.icon to any non-empty trimmed string (typically an emoji glyph; URLs starting with http(s) or data:image are also accepted). Best-effort calls drawMilitary() so the armies layer re-renders with the new icon. Regiment ids are per-state, so BOTH state (id or case-insensitive name / fullName) and regiment (numeric regiment.i or case-insensitive current regiment name within the state) are required. Idempotent.",
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
        icon: {
          type: "string",
          description:
            "New icon string (emoji or URL). Non-empty after trimming.",
        },
      },
      required: ["state", "regiment", "icon"],
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
      if (typeof input.icon !== "string") {
        return errorResult("icon must be a non-empty string.");
      }
      const trimmed = input.icon.trim();
      if (!trimmed) {
        return errorResult("icon must be a non-empty string.");
      }

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;
      const current = runtime.find(stateRef, regRef);
      if (!current) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      if (current.previousIcon === trimmed) {
        return okResult({
          stateId: current.stateId,
          stateName: current.stateName,
          i: current.i,
          name: current.name,
          icon: trimmed,
          previousIcon: current.previousIcon,
          noop: true,
        });
      }

      try {
        runtime.apply(current.stateId, current.i, trimmed);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: current.stateId,
        stateName: current.stateName,
        i: current.i,
        name: current.name,
        icon: trimmed,
        previousIcon: current.previousIcon,
        noop: false,
      });
    },
  };
}

export const setRegimentIconTool = createSetRegimentIconTool();
