import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { CELLS_DENSITY_MAP } from "./set-cells-density";

export interface CellsDensityReadRuntime {
  read(): number | null;
}

const SUPPORTED_COUNTS: ReadonlySet<number> = new Set(
  Object.values(CELLS_DENSITY_MAP),
);

function parseFinitePositiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0)
      return null;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
  }
  return null;
}

function levelToCells(level: number | null): number | null {
  if (level === null) return null;
  return CELLS_DENSITY_MAP[level] ?? null;
}

export const defaultCellsDensityReadRuntime: CellsDensityReadRuntime = {
  read(): number | null {
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        "pointsInput",
      ) as HTMLInputElement | null;
      if (el) {
        const fromDataset = parseFinitePositiveInt(el.dataset?.cells);
        if (fromDataset !== null && SUPPORTED_COUNTS.has(fromDataset)) {
          return fromDataset;
        }
        const fromValue = levelToCells(parseFinitePositiveInt(el.value));
        if (fromValue !== null) return fromValue;
      }
    }
    if (typeof localStorage !== "undefined") {
      const fromStore = levelToCells(
        parseFinitePositiveInt(localStorage.getItem("points")),
      );
      if (fromStore !== null) return fromStore;
    }
    return null;
  },
};

export function createGetCellsDensityTool(
  runtime: CellsDensityReadRuntime = defaultCellsDensityReadRuntime,
): Tool {
  return {
    name: "get_cells_density",
    description:
      'Read the current map resolution (cell count) — inverse of `set_cells_density`. Reports the Options dialog\'s Points Number slider as an absolute cell count (one of 1000, 2000, 5000, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000). Resolution order: `pointsInput.dataset.cells` (the absolute count the UI stores when valid and one of the supported counts), then `pointsInput.value` (level 1–13) mapped through the cells-density table, then `localStorage.getItem("points")` (level 1–13) mapped through the same table. There is no `window.options` surface — the setter writes only to the DOM and localStorage. Returns `{ ok, value }` where `value` is the cell count when resolved, or `null` if no source has a usable value. Read-only — never mutates the DOM, localStorage, or anything else. Takes no parameters.',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const value = runtime.read();
      return okResult({ value });
    },
  };
}

export const getCellsDensityTool = createGetCellsDensityTool();
