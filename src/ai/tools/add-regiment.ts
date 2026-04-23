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

interface PackWithCells extends BurgPackLike {
  cells?: {
    h?: ArrayLike<number>;
    p?: [number, number][];
  };
}

interface MilitaryModule {
  getName?: (reg: RawRegiment, military: RawRegiment[]) => string;
  generateNote?: (reg: RawRegiment, state: RawState) => void;
}

export interface AddRegimentStateInfo {
  stateId: number;
  stateName: string;
}

export interface AddRegimentResult {
  i: number;
  name: string;
  cell: number;
  x: number;
  y: number;
  n: number;
  state: number;
}

export interface AddRegimentRuntime {
  findState(stateRef: number | string): AddRegimentStateInfo | null;
  findCell(x: number, y: number): number | null;
  centroid(cellId: number): [number, number] | null;
  naval(cellId: number): number;
  add(
    stateId: number,
    cellId: number,
    x: number,
    y: number,
    n: number,
  ): AddRegimentResult;
}

function isValidRef(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  return typeof value === "string" && value.trim().length > 0;
}

export const defaultAddRegimentRuntime: AddRegimentRuntime = {
  findState(stateRef) {
    const pack = getPack<PackWithCells>();
    const stateId = resolveStateRefInPack(pack, stateRef);
    if (stateId === null) return null;
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) return null;
    return { stateId, stateName: state.name ?? "" };
  },
  findCell(x, y) {
    const fn = getGlobal<(x: number, y: number) => number>("findCell");
    if (typeof fn !== "function") return null;
    const cellId = fn(x, y);
    if (!Number.isFinite(cellId) || !Number.isInteger(cellId)) return null;
    return cellId;
  },
  centroid(cellId) {
    const p = getPack<PackWithCells>()?.cells?.p;
    if (!p || !Array.isArray(p)) return null;
    const point = p[cellId];
    if (!point || point.length < 2) return null;
    return [point[0], point[1]];
  },
  naval(cellId) {
    const h = getPack<PackWithCells>()?.cells?.h;
    if (!h) return 0;
    return Number(h[cellId] < 20);
  },
  add(stateId, cellId, x, y, n) {
    const pack = getPack<PackWithCells>();
    const state = pack?.states?.[stateId];
    if (!state || !isActive(state)) {
      throw new Error(`State ${stateId} not found.`);
    }
    if (!Array.isArray(state.military)) state.military = [];
    const military = state.military as RawRegiment[];
    const module = getGlobal<MilitaryModule>("Military");
    if (!module || typeof module.getName !== "function") {
      throw new Error(
        "Military.getName is not available yet; the map hasn't finished loading.",
      );
    }
    const lastReg = military.length ? military[military.length - 1] : null;
    const i = lastReg && typeof lastReg.i === "number" ? lastReg.i + 1 : 0;
    const reg: RawRegiment = {
      i,
      cell: cellId,
      n,
      u: {},
      a: 0,
      x,
      y,
      state: stateId,
      icon: "🛡️",
    };
    (reg as RawRegiment & { bx: number; by: number }).bx = x;
    (reg as RawRegiment & { bx: number; by: number }).by = y;
    reg.name = module.getName(reg, military);
    military.push(reg);
    try {
      module.generateNote?.(reg, state);
    } catch {
      // Best-effort.
    }
    try {
      getGlobal<(reg: RawRegiment, stateId: number) => void>("drawRegiment")?.(
        reg,
        stateId,
      );
    } catch {
      // Best-effort.
    }
    return {
      i,
      name: reg.name ?? "",
      cell: cellId,
      x,
      y,
      n,
      state: stateId,
    };
  },
};

export function createAddRegimentTool(
  runtime: AddRegimentRuntime = defaultAddRegimentRuntime,
): Tool {
  return {
    name: "add_regiment",
    description:
      'Create a new regiment for a state at (x, y) — same side-effect as the Regiment Editor\'s "Add unit" mode. The new regiment snaps to the target cell\'s centroid, picks up a naval flag (1 if the cell is water, else 0), gets a fresh per-state id (last + 1), zero units (empty `u`) and `a = 0`, default icon "🛡️", and an auto-generated name via Military.getName. Legend note created via Military.generateNote. After creation, use set_regiment_unit / set_regiment_icon / rename_regiment to customize. Works for any active state including Neutrals (id 0).',
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description:
            "Owning state — numeric id (0 = Neutrals is valid) or case-insensitive state name / fullName.",
        },
        x: {
          type: "number",
          description:
            "x coordinate (finite number). The regiment snaps to the cell centroid found by findCell.",
        },
        y: {
          type: "number",
          description:
            "y coordinate (finite number). The regiment snaps to the cell centroid.",
        },
      },
      required: ["state", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        x?: unknown;
        y?: unknown;
      };

      if (!isValidRef(input.state)) {
        return errorResult(
          "state must be a non-negative integer id or a non-empty name string.",
        );
      }
      if (typeof input.x !== "number" || !Number.isFinite(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (typeof input.y !== "number" || !Number.isFinite(input.y)) {
        return errorResult("y must be a finite number.");
      }
      const stateRef = input.state as number | string;
      const x = input.x;
      const y = input.y;

      const stateInfo = runtime.findState(stateRef);
      if (!stateInfo) {
        return errorResult(
          `No state found matching ${JSON.stringify(stateRef)}.`,
        );
      }

      const cellId = runtime.findCell(x, y);
      if (cellId === null) {
        return errorResult(
          "findCell is not available yet; the map hasn't finished loading.",
        );
      }

      const centroid = runtime.centroid(cellId);
      if (!centroid) {
        return errorResult(
          `pack.cells.p[${cellId}] is not available (cannot compute regiment centroid).`,
        );
      }
      const [cx, cy] = centroid;
      const n = runtime.naval(cellId);

      let result: AddRegimentResult;
      try {
        result = runtime.add(stateInfo.stateId, cellId, cx, cy, n);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        stateId: stateInfo.stateId,
        stateName: stateInfo.stateName,
        i: result.i,
        name: result.name,
        cell: result.cell,
        x: result.x,
        y: result.y,
        n: result.n,
      });
    },
  };
}

export const addRegimentTool = createAddRegimentTool();
