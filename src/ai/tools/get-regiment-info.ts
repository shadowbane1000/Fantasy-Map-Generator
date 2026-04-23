import {
  errorResult,
  getPack,
  isActive,
  okResult,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";
import { findRegimentByRef } from "./rename-regiment";

export interface StateRef {
  id: number;
  name: string;
}

export interface RegimentInfo {
  state: StateRef;
  i: number;
  name: string;
  icon: string | null;
  type: string | null;
  x: number;
  y: number;
  cell: number;
  n: number;
  army: number;
  overall: number;
  units: Record<string, number>;
  naval: boolean;
}

export type ReadRegimentInfoResult = RegimentInfo | "not-ready" | "not-found";

export interface RegimentInfoPackLike {
  states?: RawState[];
}

function numOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function cloneUnits(u: unknown): Record<string, number> {
  if (!u || typeof u !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(u as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function readRegimentInfoFromPack(
  pack: RegimentInfoPackLike | undefined,
  stateRef: number | string,
  regRef: number | string,
): ReadRegimentInfoResult {
  if (!pack?.states) return "not-ready";

  const stateId = resolveStateRefInPack(pack as BurgPackLike, stateRef);
  if (stateId === null) return "not-found";

  const state = pack.states[stateId];
  if (!state || !isActive(state)) return "not-found";

  const reg = findRegimentByRef(state.military, regRef);
  if (!reg) return "not-found";

  const n = numOrZero((reg as RawRegiment & { t?: unknown }).t);
  return {
    state: { id: state.i, name: state.name ?? "" },
    i: reg.i,
    name: reg.name ?? "",
    icon: strOrNull(reg.icon),
    type: strOrNull(reg.type),
    x: numOrZero(reg.x),
    y: numOrZero(reg.y),
    cell: numOrZero(reg.cell),
    n,
    army: numOrZero(reg.a),
    overall: n,
    units: cloneUnits(reg.u),
    naval: reg.n === 1,
  };
}

export interface RegimentInfoRuntime {
  readRegiment(
    stateRef: number | string,
    regRef: number | string,
  ): ReadRegimentInfoResult;
}

export const defaultRegimentInfoRuntime: RegimentInfoRuntime = {
  readRegiment(stateRef, regRef): ReadRegimentInfoResult {
    return readRegimentInfoFromPack(
      getPack<RegimentInfoPackLike>(),
      stateRef,
      regRef,
    );
  },
};

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function createGetRegimentInfoTool(
  runtime: RegimentInfoRuntime = defaultRegimentInfoRuntime,
): Tool {
  return {
    name: "get_regiment_info",
    description:
      "Read detailed info for a single military regiment — the per-regiment parallel of get_state_info / get_burg_info / get_province_info / get_marker_info / get_river_info. Regiments live nested per-state at pack.states[stateI].military[], so their i is per-state (not globally unique) — provide BOTH the owning state (numeric id > 0 or case-insensitive state name / fullName) AND the regiment (numeric regiment.i or case-insensitive regiment name within that state). Resolution reuses the same helpers rename_regiment / set_regiment_icon / set_regiment_unit / set_regiment_naval use (resolveStateRefInPack + findRegimentByRef + isActive); state 0 (the Neutrals placeholder) is rejected via the same isActive gate those tools apply, so only regiments owned by real active states are returned. Returns `state` ({id, name} of the parent state), `i` (regiment id per-state), `name`, `icon` (regiment.icon; null when unset — renderer falls back to the class-based default), `type` (regiment type label — e.g. 'melee', 'ranged', 'cavalry', 'artillery', 'fleet'; null when unset), `x` / `y` (SVG pixel coords from regiment.x / regiment.y; each defaults to 0 when the underlying field isn't a finite number — matches list_regiments' defensive fallback), `cell` (regiment.cell; defaults to 0 when missing), `n` (total soldiers — raw regiment.t which list_regiments surfaces as `total`), `army` (regiment.a — the sum of units computed by set_regiment_unit), `overall` (same as `n`), `units` (a shallow clone of regiment.u — unit type → count map, same shape set_regiment_unit writes), and `naval` (boolean — regiment.n === 1; the raw `n` field is a 0/1 naval flag per set_regiment_naval). Useful before taking any regiment-targeted action (rename_regiment, set_regiment_icon, set_regiment_unit, set_regiment_naval, move_regiment, split_regiment, remove_regiment, regenerate_regiment_names). Errors on un-generated map, an unresolvable state/regiment ref, state 0 (Neutrals), or a regiment owned by a removed state. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Owning state — numeric id (> 0) or case-insensitive state name / fullName. State 0 (Neutrals) is rejected via the shared isActive gate.",
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
      const result = runtime.readRegiment(stateRef, regRef);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getRegimentInfoTool = createGetRegimentInfoTool();
