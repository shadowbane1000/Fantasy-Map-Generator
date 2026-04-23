import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Smooth" button default arguments — kept verbatim from
 * `public/modules/ui/heightmap-editor.js:788` (`smoothAllHeights`):
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.smooth(4, 1.5);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * `factor` is the smoothing fraction `fr` in `smooth(fr, add)`
 * (`src/modules/heightmap-generator.ts:504`): `fr=1` = pure mean of cell +
 * neighbors, higher values keep more of the original height. `add` is a
 * constant offset applied inside the smoothing formula — the UI passes 1.5
 * so repeated smoothing doesn't drive everything towards sea level.
 */
export const DEFAULT_SMOOTH_FACTOR = 4;
export const DEFAULT_SMOOTH_ADD = 1.5;

export const SMOOTH_FACTOR_MIN = 1;
export const SMOOTH_FACTOR_MAX = 100;
export const SMOOTH_ADD_MIN = -100;
export const SMOOTH_ADD_MAX = 100;

export interface SmoothHeightmapRuntime {
  smooth(factor: number, add: number): { cellsChanged: number };
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  smooth(factor: number, add: number): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultSmoothHeightmapRuntime: SmoothHeightmapRuntime = {
  smooth(factor, add): { cellsChanged: number } {
    const grid = getGlobal<GridLike>("grid");
    if (!grid || !grid.cells || !grid.cells.h) {
      throw new Error(
        "window.grid is not available yet; the map has not finished initial loading.",
      );
    }
    const heightmap = getGlobal<HeightmapGeneratorLike>("HeightmapGenerator");
    if (
      !heightmap ||
      typeof heightmap.setGraph !== "function" ||
      typeof heightmap.smooth !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    const before = Array.from(grid.cells.h);

    heightmap.setGraph(grid);
    heightmap.smooth(factor, add);
    const next = heightmap.getHeights();
    if (!next) {
      throw new Error("HeightmapGenerator.getHeights() returned no heights.");
    }
    // Assign back onto grid exactly like the UI does.
    (grid.cells as { h: ArrayLike<number> }).h = next;

    let cellsChanged = 0;
    const len = Math.min(before.length, next.length);
    for (let i = 0; i < len; i++) {
      if (before[i] !== next[i]) cellsChanged++;
    }
    return { cellsChanged };
  },
};

function validateNumber(
  name: string,
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
): number | string {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return `${name} must be a finite number.`;
  }
  if (raw < min || raw > max) {
    return `${name} must be in the range [${min}, ${max}].`;
  }
  return raw;
}

export function createSmoothHeightmapTool(
  runtime: SmoothHeightmapRuntime = defaultSmoothHeightmapRuntime,
): Tool {
  return {
    name: "smooth_heightmap",
    description:
      "Smooth the terrain heightmap — the same side-effect as clicking the Heightmap Editor's 'Smooth' button (`smoothAllHeights`). Averages each cell's height with its Voronoi neighbours via `HeightmapGenerator.smooth(factor, add)` and writes the result back onto `grid.cells.h`. `factor` is the smoothing fraction (default 4 — matches the UI; 1 = full smooth / pure mean, higher = less smoothing). `add` is a constant offset applied inside the formula (default 1.5 — matches the UI; keeps repeated smoothing from sinking the map). Does NOT auto-regenerate downstream domains — call `regenerate_map` afterwards if you want biomes / rivers / states to refresh against the smoothed heights. Returns `{factor, add, cellsChanged}`.",
    input_schema: {
      type: "object",
      properties: {
        factor: {
          type: "number",
          minimum: SMOOTH_FACTOR_MIN,
          maximum: SMOOTH_FACTOR_MAX,
          description: `Smoothing fraction (fr in HeightmapGenerator.smooth). Default ${DEFAULT_SMOOTH_FACTOR}. 1 = full smooth (pure neighbour mean); higher values keep more of the original height.`,
        },
        add: {
          type: "number",
          minimum: SMOOTH_ADD_MIN,
          maximum: SMOOTH_ADD_MAX,
          description: `Additive offset applied inside the smoothing formula. Default ${DEFAULT_SMOOTH_ADD}.`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { factor?: unknown; add?: unknown };

      const factor = validateNumber(
        "factor",
        input.factor,
        SMOOTH_FACTOR_MIN,
        SMOOTH_FACTOR_MAX,
        DEFAULT_SMOOTH_FACTOR,
      );
      if (typeof factor === "string") return errorResult(factor);

      const add = validateNumber(
        "add",
        input.add,
        SMOOTH_ADD_MIN,
        SMOOTH_ADD_MAX,
        DEFAULT_SMOOTH_ADD,
      );
      if (typeof add === "string") return errorResult(add);

      try {
        const { cellsChanged } = runtime.smooth(factor, add);
        return okResult({ factor, add, cellsChanged });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const smoothHeightmapTool = createSmoothHeightmapTool();
