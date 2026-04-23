import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithHeights {
  cells?: { h?: ArrayLike<number> };
  religions?: RawReligion[];
}

interface ReligionsModule {
  add?: (center: number) => void;
}

export interface AddReligionCellInfo {
  land: boolean;
  occupiedBy: number | null;
}

export interface AddReligionResult {
  i: number;
  name: string;
  center: number;
  color: string;
  type: string;
  form: string;
  deity: string | null;
  expansion: string;
  expansionism: number;
}

export interface AddReligionRuntime {
  findCell(x: number, y: number): number | null;
  validateCell(cellId: number): AddReligionCellInfo;
  add(cellId: number): AddReligionResult;
}

export const defaultAddReligionRuntime: AddReligionRuntime = {
  findCell(x, y) {
    const fn = getGlobal<(x: number, y: number) => number>("findCell");
    if (typeof fn !== "function") return null;
    const cellId = fn(x, y);
    if (!Number.isFinite(cellId) || !Number.isInteger(cellId)) return null;
    return cellId;
  },
  validateCell(cellId) {
    const pack = getPack<PackWithHeights>();
    const h = pack?.cells?.h?.[cellId];
    const land = typeof h === "number" && h >= 20;
    let occupiedBy: number | null = null;
    for (const r of pack?.religions ?? []) {
      if (!r || r.removed) continue;
      if (r.center === cellId) {
        occupiedBy = r.i;
        break;
      }
    }
    return { land, occupiedBy };
  },
  add(cellId) {
    const module = getGlobal<ReligionsModule>("Religions");
    if (!module || typeof module.add !== "function") {
      throw new Error(
        "Religions.add is not available yet; the map hasn't finished loading.",
      );
    }
    module.add(cellId);
    const religions = getPack<PackWithHeights>()?.religions;
    const last = Array.isArray(religions)
      ? religions[religions.length - 1]
      : undefined;
    if (!last) {
      throw new Error("New religion was not added (pack state inconsistent).");
    }
    return {
      i: last.i,
      name: last.name ?? "",
      center: last.center ?? cellId,
      color: last.color ?? "",
      type: last.type ?? "",
      form: last.form ?? "",
      deity: last.deity ?? null,
      expansion: last.expansion ?? "",
      expansionism:
        typeof last.expansionism === "number" ? last.expansionism : 1,
    };
  },
};

export function createAddReligionTool(
  runtime: AddReligionRuntime = defaultAddReligionRuntime,
): Tool {
  return {
    name: "add_religion",
    description:
      "Create a new religion centered on cell at (x, y) — same side-effect as clicking a land cell in the Religions Editor's Add Religion mode. Uses findCell(x, y) to locate the cell, validates the cell is land (height ≥ 20) and not already a religion center, then delegates to Religions.add(cellId). The new religion's type / form / deity / expansion are auto-selected from the cell's culture context (Folk if the culture has no existing Folk faith; otherwise Organized / Cult / Heresy). Follow up with rename_religion / set_religion_type / set_religion_form / set_religion_deity / set_religion_expansion / set_religion_color to customize.",
    input_schema: {
      type: "object",
      properties: {
        x: {
          type: "number",
          description: "x coordinate (finite number).",
        },
        y: {
          type: "number",
          description: "y coordinate (finite number).",
        },
      },
      required: ["x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { x?: unknown; y?: unknown };

      if (typeof input.x !== "number" || !Number.isFinite(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (typeof input.y !== "number" || !Number.isFinite(input.y)) {
        return errorResult("y must be a finite number.");
      }
      const x = input.x;
      const y = input.y;

      const cellId = runtime.findCell(x, y);
      if (cellId === null) {
        return errorResult(
          "findCell is not available yet; the map hasn't finished loading.",
        );
      }

      const { land, occupiedBy } = runtime.validateCell(cellId);
      if (!land) {
        return errorResult(
          `Cannot place a religion center on cell ${cellId}: it's water (height < 20).`,
        );
      }
      if (occupiedBy !== null) {
        return errorResult(
          `Cell ${cellId} is already the center of religion ${occupiedBy}.`,
        );
      }

      let result: AddReligionResult;
      try {
        result = runtime.add(cellId);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: result.i,
        name: result.name,
        center: result.center,
        color: result.color,
        type: result.type,
        form: result.form,
        deity: result.deity,
        expansion: result.expansion,
        expansionism: result.expansionism,
      });
    },
  };
}

export const addReligionTool = createAddReligionTool();
