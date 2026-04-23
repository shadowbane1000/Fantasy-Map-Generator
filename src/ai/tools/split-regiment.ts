import {
  errorResult,
  getGlobal,
  getPack,
  isActive,
  okResult,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";
import { findRegimentByRef } from "./rename-regiment";

export interface SplitRegimentRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
  units: Record<string, number>;
}

export interface SplitRegimentResult {
  newRegimentId: number;
  newName: string;
  oldTotal: number;
  newTotal: number;
}

export interface SplitRegimentRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): SplitRegimentRef | null;
  split(ref: SplitRegimentRef): SplitRegimentResult;
}

interface MilitaryModule {
  getName?: (reg: RawRegiment, military: RawRegiment[]) => string;
  generateNote?: (reg: RawRegiment, state: RawState) => void;
}

interface ArmiesSelection {
  attr?: (key: string) => string;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

function sumUnits(u: Record<string, number>): number {
  let sum = 0;
  for (const v of Object.values(u)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) sum += v;
  }
  return sum;
}

export const defaultSplitRegimentRuntime: SplitRegimentRuntime = {
  find(stateRef, regRef) {
    const pack = getPack<BurgPackLike>();
    const stateId = resolveStateRefInPack(pack, stateRef);
    if (stateId === null) return null;
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) return null;
    const reg = findRegimentByRef(state.military, regRef);
    if (!reg) return null;
    const rawUnits = (reg.u ?? {}) as Record<string, unknown>;
    const units: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawUnits)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) units[k] = v;
    }
    return {
      stateId,
      stateName: state.name ?? "",
      i: reg.i,
      name: reg.name ?? "",
      units,
    };
  },
  split(ref) {
    const pack = getPack<BurgPackLike>();
    const state = pack?.states?.[ref.stateId];
    if (!state || !isActive(state)) {
      throw new Error(`State ${ref.stateId} not found.`);
    }
    const reg = findRegimentByRef(state.military, ref.i);
    if (!reg) {
      throw new Error(`Regiment ${ref.i} not found in state ${ref.stateId}.`);
    }
    const u1: Record<string, number> = {};
    const u2: Record<string, number> = {};
    const source = (reg.u ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(source)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
      u1[k] = Math.ceil(v / 2);
      u2[k] = Math.floor(v / 2);
    }
    const newTotal = sumUnits(u2);
    if (newTotal === 0) {
      throw new Error("Not enough forces to split.");
    }
    const oldTotal = sumUnits(u1);
    reg.u = u1;
    (reg as RawRegiment).a = oldTotal;

    const military = state.military as RawRegiment[];
    const lastI = military.length
      ? (military[military.length - 1]?.i ?? military.length - 1)
      : 0;
    const newI = lastI + 1;

    const armies = getGlobal<ArmiesSelection>("armies");
    const boxSize = Number(armies?.attr?.("box-size") ?? 15);
    const shift = boxSize * 2;
    let newY = typeof reg.y === "number" ? reg.y : 0;
    const baseX = typeof reg.x === "number" ? reg.x : 0;
    let attempts = 0;
    // Shift down until no existing regiment sits at the same point.
    do {
      newY += shift;
      attempts++;
      if (attempts > 1000) break;
    } while (
      military.some((r) => r && r.x === baseX && r.y === newY && r.i !== ref.i)
    );

    const newReg: RawRegiment = {
      i: newI,
      x: baseX,
      y: newY,
      cell: reg.cell,
      n: reg.n,
      u: u2,
      a: newTotal,
      state: ref.stateId,
      icon: reg.icon,
    };

    const militaryModule = getGlobal<MilitaryModule>("Military");
    if (!militaryModule || typeof militaryModule.getName !== "function") {
      throw new Error(
        "Military.getName is not available yet; the map hasn't finished loading.",
      );
    }
    newReg.name = militaryModule.getName(newReg, military);
    military.push(newReg);
    try {
      militaryModule.generateNote?.(newReg, state);
    } catch {
      // Best-effort.
    }
    try {
      getGlobal<(reg: RawRegiment, stateId: number) => void>("drawRegiment")?.(
        newReg,
        ref.stateId,
      );
    } catch {
      // Best-effort.
    }

    return {
      newRegimentId: newI,
      newName: newReg.name ?? "",
      oldTotal,
      newTotal,
    };
  },
};

export function createSplitRegimentTool(
  runtime: SplitRegimentRuntime = defaultSplitRegimentRuntime,
): Tool {
  return {
    name: "split_regiment",
    description:
      "Split a regiment into two — same side-effect as the Regiment Editor's Split button. 50/50 split: each unit key in regiment.u is divided (ceil half stays on the source regiment, floor half moves to the new one). The new regiment inherits the source's cell, naval flag, bx/by, and icon; gets a fresh per-state id (last + 1), an auto-generated name via Military.getName, and a legend via Military.generateNote. Rejects the split if the resulting new regiment would have zero forces (matches the UI's 'Not enough forces to split' guard). Same (state, regiment) two-part ref as the other regiment tools.",
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
            "Numeric regiment id (per-state) or case-insensitive current regiment name within that state.",
        },
      },
      required: ["state", "regiment"],
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

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;

      const current = runtime.find(stateRef, regRef);
      if (!current) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      let result: SplitRegimentResult;
      try {
        result = runtime.split(current);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: current.stateId,
        stateName: current.stateName,
        i: current.i,
        name: current.name,
        newRegimentId: result.newRegimentId,
        newName: result.newName,
        oldTotal: result.oldTotal,
        newTotal: result.newTotal,
      });
    },
  };
}

export const splitRegimentTool = createSplitRegimentTool();
