import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Minimal shape of an entry in `pack.ice`. The real entries also carry
 * `points` and (for icebergs) `cellId`/`size`, but the only fields this
 * tool's contract reads are `i` and `type`.
 */
export interface AddIcebergIceEntry {
  i: number;
  type: string;
  cellId?: number;
  size?: number;
  [key: string]: unknown;
}

export interface AddIcebergInput {
  x: number;
  y: number;
  size: number;
}

/**
 * Runtime seam for `add_iceberg`. Every operation that touches the
 * legacy globals (`findGridCell`, `grid`, `Ice`, `pack`) goes through
 * one of these methods so unit tests can drive the tool without a real
 * browser. Each dep is resolved at call time so tests can swap globals
 * between invocations.
 */
export interface AddIcebergRuntime {
  /** Look up the grid-cell index at the given map-space coordinates. */
  findGridCell(x: number, y: number): number;
  /** Total number of grid cells (for range validation). */
  getGridCellCount(): number;
  /** Append a new iceberg via Ice.addIceberg(cellId, size). */
  addIceberg(cellId: number, size: number): void;
  /** Return the live pack.ice array reference; throws when missing. */
  getIceArray(): AddIcebergIceEntry[];
}

interface IcePackLike {
  ice?: unknown;
}

interface GridLike {
  cells?: { i?: { length?: unknown } };
}

interface IceModuleLike {
  addIceberg?: (cellId: number, size: number) => void;
}

export const defaultAddIcebergRuntime: AddIcebergRuntime = {
  findGridCell(x: number, y: number): number {
    const fn =
      getGlobal<(x: number, y: number, grid: unknown) => number>(
        "findGridCell",
      );
    if (typeof fn !== "function") {
      throw new Error("findGridCell is not available yet.");
    }
    const grid = getGlobal<GridLike>("grid");
    if (!grid) {
      throw new Error("grid is not available yet.");
    }
    return fn(x, y, grid);
  },
  getGridCellCount(): number {
    const grid = getGlobal<GridLike>("grid");
    if (!grid) {
      throw new Error("grid is not available yet.");
    }
    const len = grid.cells?.i?.length;
    if (typeof len !== "number" || !Number.isFinite(len)) {
      throw new Error("grid.cells.i is not available yet.");
    }
    return len;
  },
  addIceberg(cellId: number, size: number): void {
    const ice = getGlobal<IceModuleLike>("Ice");
    if (!ice) {
      throw new Error("Ice.addIceberg is not available yet.");
    }
    if (typeof ice.addIceberg !== "function") {
      throw new Error("Ice.addIceberg is not available yet.");
    }
    ice.addIceberg(cellId, size);
  },
  getIceArray(): AddIcebergIceEntry[] {
    const pack = getPack<IcePackLike>();
    if (!pack) {
      throw new Error("pack.ice is not available.");
    }
    if (!Array.isArray(pack.ice)) {
      throw new Error("pack.ice is not available.");
    }
    return pack.ice as AddIcebergIceEntry[];
  },
};

const SIZE_MIN_EXCLUSIVE = 0;
const SIZE_MAX = 5;
const SIZE_RANGE_MESSAGE = "size must be a finite number in (0, 5].";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isValidCellIndex(value: unknown, count: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < count
  );
}

export function createAddIcebergTool(
  runtime: AddIcebergRuntime = defaultAddIcebergRuntime,
): Tool {
  return {
    name: "add_iceberg",
    description:
      "Place a new iceberg on the map at (x, y), mirroring the Edit Ice editor's \"Add Iceberg\" → click flow (public/modules/ui/ice-editor.js#addIcebergOnClick). Resolves the grid cell via the global findGridCell(x, y, grid) and calls Ice.addIceberg(cellId, size); Ice.addIceberg pushes a new entry into pack.ice and triggers redrawIceberg(). Inputs: x, y (map-space pixel coordinates, required), size (multiplier, default 1, must be in (0, 5]). Sizes much larger than 5 produce icebergs that overlap their cell. Returns { ok, id, cell_id, size } where id is the new iceberg's pack.ice entry id.",
    input_schema: {
      type: "object",
      properties: {
        x: {
          type: "number",
          description: "X map-space coordinate.",
        },
        y: {
          type: "number",
          description: "Y map-space coordinate.",
        },
        size: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 5,
          description: "Iceberg size multiplier. Default 1. Must be in (0, 5].",
        },
      },
      required: ["x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;

      if (!isFiniteNumber(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (!isFiniteNumber(input.y)) {
        return errorResult("y must be a finite number.");
      }

      let size = 1;
      if (input.size !== undefined && input.size !== null) {
        if (!isFiniteNumber(input.size)) {
          return errorResult(SIZE_RANGE_MESSAGE);
        }
        if (input.size <= SIZE_MIN_EXCLUSIVE || input.size > SIZE_MAX) {
          return errorResult(SIZE_RANGE_MESSAGE);
        }
        size = input.size;
      }

      const x = input.x;
      const y = input.y;

      let cellCount: number;
      try {
        cellCount = runtime.getGridCellCount();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let cellId: number;
      try {
        cellId = runtime.findGridCell(x, y);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (!isValidCellIndex(cellId, cellCount)) {
        return errorResult("no grid cell at (x, y).");
      }

      let iceArray: AddIcebergIceEntry[];
      try {
        iceArray = runtime.getIceArray();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      const beforeLen = iceArray.length;

      try {
        runtime.addIceberg(cellId, size);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      // Re-resolve in case the runtime swapped the array reference.
      let afterArray: AddIcebergIceEntry[];
      try {
        afterArray = runtime.getIceArray();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (afterArray.length !== beforeLen + 1) {
        return errorResult("Ice.addIceberg did not push a new ice element.");
      }

      const created = afterArray[afterArray.length - 1];
      if (!created || typeof created !== "object") {
        return errorResult("Ice.addIceberg pushed an invalid entry.");
      }
      if (created.type !== "iceberg") {
        return errorResult(
          "Ice.addIceberg pushed an entry of unexpected type.",
        );
      }
      if (typeof created.i !== "number" || !Number.isFinite(created.i)) {
        return errorResult(
          "Ice.addIceberg pushed an entry without a valid id.",
        );
      }

      return okResult({
        id: created.i,
        cell_id: cellId,
        size,
      });
    },
  };
}

export const addIcebergTool = createAddIcebergTool();
