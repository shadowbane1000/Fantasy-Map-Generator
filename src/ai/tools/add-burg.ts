import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

interface PackWithHeights {
  cells?: { h?: ArrayLike<number>; burg?: number[] };
  burgs?: RawBurg[];
}

interface BurgsModule {
  add?: (point: [number, number]) => number;
}

export interface AddBurgLandInfo {
  land: boolean;
  occupiedBy: number;
}

export interface AddBurgResult {
  i: number;
  cell: number;
  state: number;
  culture: number;
  name: string;
  x: number;
  y: number;
  port: number;
  capital: number;
}

export interface AddBurgRuntime {
  findCell(x: number, y: number): number | null;
  landOccupancy(cellId: number): AddBurgLandInfo;
  add(x: number, y: number): AddBurgResult;
}

export const defaultAddBurgRuntime: AddBurgRuntime = {
  findCell(x, y) {
    const fn = getGlobal<(x: number, y: number) => number>("findCell");
    if (typeof fn !== "function") return null;
    const cellId = fn(x, y);
    if (!Number.isFinite(cellId) || !Number.isInteger(cellId)) return null;
    return cellId;
  },
  landOccupancy(cellId) {
    const pack = getPack<PackWithHeights>();
    const h = pack?.cells?.h?.[cellId];
    const burgCell = pack?.cells?.burg?.[cellId];
    return {
      land: typeof h === "number" && h >= 20,
      occupiedBy: typeof burgCell === "number" ? burgCell : 0,
    };
  },
  add(x, y) {
    const module = getGlobal<BurgsModule>("Burgs");
    if (!module || typeof module.add !== "function") {
      throw new Error(
        "Burgs.add is not available yet; the map hasn't finished loading.",
      );
    }
    const id = module.add([x, y]);
    const pack = getPack<PackWithHeights>();
    const burg = pack?.burgs?.[id];
    if (!burg) {
      throw new Error(`Burg ${id} was not added (pack state inconsistent).`);
    }
    return {
      i: burg.i,
      cell: burg.cell ?? 0,
      state: typeof burg.state === "number" ? burg.state : 0,
      culture: typeof burg.culture === "number" ? burg.culture : 0,
      name: burg.name ?? "",
      x: burg.x ?? x,
      y: burg.y ?? y,
      port: typeof burg.port === "number" ? burg.port : 0,
      capital: typeof burg.capital === "number" ? burg.capital : 0,
    };
  },
};

export function createAddBurgTool(
  runtime: AddBurgRuntime = defaultAddBurgRuntime,
): Tool {
  return {
    name: "add_burg",
    description:
      "Create a new burg at (x, y) — same side-effect as clicking a land cell in the Tools panel's Add Burg mode. Uses findCell(x, y) to locate the cell, validates the cell is land (height ≥ 20) and not already occupied by another burg, then delegates to Burgs.add([x, y]). The new burg inherits culture / state from the cell, gets a culture-appropriate generated name, and is automatically populated, emblemed, and wired into the routes network. After creation, use rename_burg / set_burg_culture / set_burg_type etc. to customize further.",
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

      const { land, occupiedBy } = runtime.landOccupancy(cellId);
      if (!land) {
        return errorResult(
          `Cannot place a burg on cell ${cellId}: it's water (height < 20).`,
        );
      }
      if (occupiedBy > 0) {
        return errorResult(
          `Cannot place a burg on cell ${cellId}: already occupied by burg ${occupiedBy}.`,
        );
      }

      let result: AddBurgResult;
      try {
        result = runtime.add(x, y);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: result.i,
        cell: result.cell,
        state: result.state,
        culture: result.culture,
        name: result.name,
        x: result.x,
        y: result.y,
        port: result.port,
        capital: result.capital,
      });
    },
  };
}

export const addBurgTool = createAddBurgTool();
