import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithHeights {
  cells?: { h?: ArrayLike<number> };
  cultures?: RawCulture[];
}

interface CulturesModule {
  add?: (center: number) => void;
}

export interface AddCultureCellInfo {
  land: boolean;
  occupiedBy: number | null;
}

export interface AddCultureResult {
  i: number;
  name: string;
  center: number;
  color: string;
  base: number;
  expansionism: number;
  type: string;
}

export interface AddCultureRuntime {
  findCell(x: number, y: number): number | null;
  validateCell(cellId: number): AddCultureCellInfo;
  add(cellId: number): AddCultureResult;
}

export const defaultAddCultureRuntime: AddCultureRuntime = {
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
    for (const c of pack?.cultures ?? []) {
      if (!c || c.removed) continue;
      if (c.center === cellId) {
        occupiedBy = c.i;
        break;
      }
    }
    return { land, occupiedBy };
  },
  add(cellId) {
    const module = getGlobal<CulturesModule>("Cultures");
    if (!module || typeof module.add !== "function") {
      throw new Error(
        "Cultures.add is not available yet; the map hasn't finished loading.",
      );
    }
    module.add(cellId);
    const pack = getPack<PackWithHeights>();
    const cultures = pack?.cultures;
    const last = Array.isArray(cultures)
      ? cultures[cultures.length - 1]
      : undefined;
    if (!last) {
      throw new Error("New culture was not added (pack state inconsistent).");
    }
    return {
      i: last.i,
      name: last.name ?? "",
      center: last.center ?? cellId,
      color: last.color ?? "",
      base: typeof last.base === "number" ? last.base : 0,
      expansionism:
        typeof last.expansionism === "number" ? last.expansionism : 1,
      type: last.type ?? "Generic",
    };
  },
};

export function createAddCultureTool(
  runtime: AddCultureRuntime = defaultAddCultureRuntime,
): Tool {
  return {
    name: "add_culture",
    description:
      "Create a new culture centered on cell at (x, y) — same side-effect as clicking a land cell in the Cultures Editor's Add Culture mode. Uses findCell(x, y) to locate the cell, validates the cell is land (height ≥ 20) and not already a culture center, then delegates to Cultures.add(cellId). The new culture gets an auto-generated name, default expansionism (1), color, name-base, emblem shape, and Type 'Generic'. After creation, use rename_culture / set_culture_type / set_culture_color / set_culture_base / set_culture_shield to customize.",
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
          `Cannot place a culture center on cell ${cellId}: it's water (height < 20).`,
        );
      }
      if (occupiedBy !== null) {
        return errorResult(
          `Cell ${cellId} is already the center of culture ${occupiedBy}.`,
        );
      }

      let result: AddCultureResult;
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
        base: result.base,
        expansionism: result.expansionism,
        type: result.type,
      });
    },
  };
}

export const addCultureTool = createAddCultureTool();
