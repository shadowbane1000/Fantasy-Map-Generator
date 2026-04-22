import {
  errorResult,
  getPack,
  isActive,
  okResult,
  type RawRegiment,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { type BurgPackLike, resolveStateRefInPack } from "./list-burgs";

export interface RegimentRenameRef {
  stateId: number;
  stateName: string;
  i: number;
  name: string;
}

export interface RegimentRenameRuntime {
  find(
    stateRef: number | string,
    regRef: number | string,
  ): RegimentRenameRef | null;
  rename(stateId: number, i: number, name: string): void;
}

export function findRegimentByRef(
  military: RawRegiment[] | undefined,
  ref: number | string,
): RawRegiment | null {
  if (!Array.isArray(military)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return null;
    for (const r of military) {
      if (r && r.i === ref) return r;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const r of military) {
    if (!r) continue;
    if ((r.name ?? "").toLowerCase() === needle) return r;
  }
  return null;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultRegimentRenameRuntime: RegimentRenameRuntime = {
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
  rename(stateId: number, i: number, name: string): void {
    const pack = getPack<BurgPackLike>();
    const state = pack?.states?.[stateId];
    if (!state) throw new Error(`State ${stateId} not found.`);
    const regiment = findRegimentByRef(state.military, i);
    if (!regiment) {
      throw new Error(`Regiment ${i} not found in state ${stateId}.`);
    }
    regiment.name = name;
    if (typeof document === "undefined") return;
    document
      .getElementById(`regiment${stateId}-${i}`)
      ?.setAttribute("data-name", name);
  },
};

export function createRenameRegimentTool(
  runtime: RegimentRenameRuntime = defaultRegimentRenameRuntime,
): Tool {
  return {
    name: "rename_regiment",
    description:
      "Rename a specific regiment — same side-effect as the Regiment Editor's name field. Regiment ids are per-state (not globally unique), so provide BOTH the owning state (id or case-insensitive name/fullName) and the regiment (numeric regiment.i or case-insensitive current regiment name within that state). Writes regiment.name and updates the #regiment{stateId}-{i} SVG data-name attribute used for map tooltips.",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Owning state — numeric id (0 is valid = Neutrals) or case-insensitive state name / fullName.",
        },
        regiment: {
          type: ["integer", "string"],
          description:
            "Numeric regiment id (regiment.i, per-state) or case-insensitive current regiment name within that state.",
        },
        name: {
          type: "string",
          description: "The new name for the regiment.",
        },
      },
      required: ["state", "regiment", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        regiment?: unknown;
        name?: unknown;
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
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const stateRef = input.state as number | string;
      const regRef = input.regiment as number | string;
      const current = runtime.find(stateRef, regRef);
      if (!current) {
        return errorResult(
          `No regiment found matching state=${JSON.stringify(stateRef)}, regiment=${JSON.stringify(regRef)}.`,
        );
      }

      const newName = input.name.trim();
      try {
        runtime.rename(current.stateId, current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: current.stateId,
        stateName: current.stateName,
        i: current.i,
        previousName: current.name,
        name: newName,
      });
    },
  };
}

export const renameRegimentTool = createRenameRegimentTool();
