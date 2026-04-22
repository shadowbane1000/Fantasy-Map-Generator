import { errorResult, getGlobal, getPack, isActive, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";
import { findRegimentByRef } from "./rename-regiment";

export interface RegimentUnitRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
  previousCount: number;
}

export interface RegimentUnitRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
    unit: string,
  ): RegimentUnitRef | null;
  apply(stateId: number, i: number, unit: string, count: number): void;
}

interface MilitaryModule {
  getTotal?: (regiment: unknown) => number | string;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

function sumUnits(u: Record<string, unknown>): number {
  let sum = 0;
  for (const v of Object.values(u)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) sum += v;
  }
  return sum;
}

export const defaultRegimentUnitRuntime: RegimentUnitRuntime = {
  find(stateRef, regRef, unit) {
    const pack = getPack<BurgPackLike>();
    const stateId = resolveStateRefInPack(pack, stateRef);
    if (stateId === null) return null;
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) return null;
    const reg = findRegimentByRef(state.military, regRef);
    if (!reg) return null;
    const u = reg.u as Record<string, unknown> | undefined;
    const raw = u?.[unit];
    const previousCount =
      typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    return {
      stateId,
      stateName: state.name ?? "",
      i: reg.i,
      name: reg.name ?? "",
      previousCount,
    };
  },
  apply(stateId: number, i: number, unit: string, count: number): void {
    const pack = getPack<BurgPackLike>();
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) {
      throw new Error(`State ${stateId} not found.`);
    }
    const reg = findRegimentByRef(state.military, i);
    if (!reg) {
      throw new Error(`Regiment ${i} not found in state ${stateId}.`);
    }
    if (typeof reg.u !== "object" || reg.u === null) {
      (reg as { u: Record<string, number> }).u = {};
    }
    const u = reg.u as Record<string, number>;
    u[unit] = count;
    (reg as { a?: number }).a = sumUnits(u);
    if (typeof document !== "undefined") {
      const node = document.getElementById(`regiment${stateId}-${i}`);
      if (node) {
        const text = node.querySelector?.("text");
        if (text) {
          const military = getGlobal<MilitaryModule>("Military");
          const total = military?.getTotal
            ? military.getTotal(reg)
            : ((reg as { a?: number }).a ?? 0);
          text.textContent = String(total);
        }
      }
    }
  },
};

export function createSetRegimentUnitTool(
  runtime: RegimentUnitRuntime = defaultRegimentUnitRuntime,
): Tool {
  return {
    name: "set_regiment_unit",
    description:
      "Change the count of a unit in a specific regiment. Writes regiment.u[unit] and recomputes regiment.a (army sum). If the unit key doesn't yet exist on the regiment, it's added. Matches state and regiment with the same two-part ref as rename_regiment — state by id or case-insensitive name/fullName, regiment by id or case-insensitive current name within that state. Refreshes the on-map troop total when the Military module is available.",
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
        unit: {
          type: "string",
          description:
            "Unit name key (e.g. 'Swordsmen', 'Archers', 'Cavalry', 'Sailors'). Non-empty.",
        },
        count: {
          type: "integer",
          minimum: 0,
          description: "Number of that unit in the regiment (non-negative).",
        },
      },
      required: ["state", "regiment", "unit", "count"],
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
      if (typeof input.unit !== "string" || !input.unit.trim()) {
        return errorResult("unit must be a non-empty string.");
      }
      if (
        typeof input.count !== "number" ||
        !Number.isInteger(input.count) ||
        input.count < 0
      ) {
        return errorResult("count must be a non-negative integer.");
      }

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;
      const unit = input.unit.trim();
      const count = input.count;

      const current = runtime.find(stateRef, regRef, unit);
      if (!current) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      try {
        runtime.apply(current.stateId, current.i, unit, count);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: current.stateId,
        stateName: current.stateName,
        i: current.i,
        name: current.name,
        unit,
        previousCount: current.previousCount,
        count,
      });
    },
  };
}

export const setRegimentUnitTool = createSetRegimentUnitTool();
