import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const CELLS_DENSITY_MAP: Record<number, number> = {
  1: 1000,
  2: 2000,
  3: 5000,
  4: 10000,
  5: 20000,
  6: 30000,
  7: 40000,
  8: 50000,
  9: 60000,
  10: 70000,
  11: 80000,
  12: 90000,
  13: 100000,
};

export const CELLS_DENSITY_OPTIONS: readonly number[] = Object.freeze(
  Object.values(CELLS_DENSITY_MAP).sort((a, b) => a - b),
);

export function resolveCellsLevel(cells: unknown): number | null {
  if (typeof cells !== "number" || !Number.isFinite(cells)) return null;
  for (const [level, count] of Object.entries(CELLS_DENSITY_MAP)) {
    if (count === cells) return Number(level);
  }
  return null;
}

export interface CellsDensityRuntime {
  read(): number | null;
  apply(level: number, cells: number): void;
}

export const defaultCellsDensityRuntime: CellsDensityRuntime = {
  read() {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(
      "pointsInput",
    ) as HTMLInputElement | null;
    if (!el) return null;
    const level = Number(el.value);
    if (!Number.isInteger(level)) return null;
    return CELLS_DENSITY_MAP[level] ?? null;
  },
  apply(level, cells) {
    const fn = getGlobal<(n: number) => void>("changeCellsDensity");
    if (typeof fn === "function") {
      fn(level);
    } else if (typeof document !== "undefined") {
      const input = document.getElementById(
        "pointsInput",
      ) as HTMLInputElement | null;
      if (input) {
        input.value = String(level);
        input.dataset.cells = String(cells);
      }
      const output = document.getElementById(
        "pointsOutputFormatted",
      ) as HTMLInputElement | null;
      if (output) output.value = `${cells / 1000}K`;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("points", String(level));
    }
  },
};

export function createSetCellsDensityTool(
  runtime: CellsDensityRuntime = defaultCellsDensityRuntime,
): Tool {
  return {
    name: "set_cells_density",
    description: `Set map resolution (cell count) — same side-effect as the Options dialog's Points Number slider. Choose from 13 discrete cell counts: ${CELLS_DENSITY_OPTIONS.join(", ")}. Higher cell counts produce more detailed maps but slower generation. Passive — the new resolution applies on the next regenerate_map. Prefers delegation to window.changeCellsDensity; falls back to manual DOM writes if the function isn't available. Idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        cells: {
          type: "integer",
          enum: [...CELLS_DENSITY_OPTIONS],
          description: `Cell count. One of: ${CELLS_DENSITY_OPTIONS.join(", ")}.`,
        },
      },
      required: ["cells"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { cells?: unknown };

      if (
        typeof input.cells !== "number" ||
        !Number.isFinite(input.cells) ||
        !Number.isInteger(input.cells)
      ) {
        return errorResult("cells must be a finite integer.", {
          supported: [...CELLS_DENSITY_OPTIONS],
        });
      }
      const level = resolveCellsLevel(input.cells);
      if (level === null) {
        return errorResult(`Unknown cells count: ${input.cells}.`, {
          supported: [...CELLS_DENSITY_OPTIONS],
        });
      }

      const current = runtime.read();
      if (current === input.cells) {
        return okResult({
          cells: input.cells,
          level,
          previousCells: current,
          noop: true,
        });
      }

      try {
        runtime.apply(level, input.cells);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        cells: input.cells,
        level,
        previousCells: current,
        noop: false,
      });
    },
  };
}

export const setCellsDensityTool = createSetCellsDensityTool();
