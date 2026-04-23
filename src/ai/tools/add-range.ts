import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Range" step default arguments — mirrors the handler in
 * `public/modules/ui/heightmap-editor.js:1085`:
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.addRange(count, height, x, y);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * `rangeX` / `rangeY` default to "20-80" — the same default used by the
 * editor's `newTemplateStep` builder when a step is added without explicit
 * X / Y fields.
 */
export const DEFAULT_RANGE_X = "20-80";
export const DEFAULT_RANGE_Y = "20-80";

export interface AddRangeRuntime {
  addRange(count: string, height: string, rangeX: string, rangeY: string): void;
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  addRange(count: string, height: string, rangeX: string, rangeY: string): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultAddRangeRuntime: AddRangeRuntime = {
  addRange(count, height, rangeX, rangeY): void {
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
      typeof heightmap.addRange !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    heightmap.setGraph(grid);
    heightmap.addRange(count, height, rangeX, rangeY);
    const next = heightmap.getHeights();
    if (!next) {
      throw new Error("HeightmapGenerator.getHeights() returned no heights.");
    }
    (grid.cells as { h: ArrayLike<number> }).h = next;
  },
};

function coerceCountOrHeight(
  name: string,
  raw: unknown,
): string | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: `${name} is required.` };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { error: `${name} must be a finite number.` };
    }
    return String(raw);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { error: `${name} must be a non-empty string.` };
    return trimmed;
  }
  return { error: `${name} must be a number or a string.` };
}

function coerceRange(
  name: string,
  raw: unknown,
  fallback: string,
): string | { error: string } {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "string") {
    return { error: `${name} must be a string like "20-80".` };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: `${name} must be a non-empty string like "20-80".` };
  }
  return trimmed;
}

export function createAddRangeTool(
  runtime: AddRangeRuntime = defaultAddRangeRuntime,
): Tool {
  return {
    name: "add_range",
    description:
      'Add a mountain range to the terrain heightmap — the same side-effect as a "Range" step in the Heightmap Editor template. Calls `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.addRange(count, height, rangeX, rangeY)` → `grid.cells.h = HeightmapGenerator.getHeights()`. Required `count` (number of ridges to add — a number or hyphen-range like "2-4"). Required `height` (ridge height — a number or hyphen-range like "40-55"). Optional `rangeX` / `rangeY` percentage-ranges for placement along each axis (default "20-80"). Does NOT auto-regenerate downstream domains — call `regenerate_map` afterwards if you want biomes / rivers / states to refresh against the new peaks. Returns `{count, height, rangeX, rangeY}`.',
    input_schema: {
      type: "object",
      properties: {
        count: {
          type: ["number", "string"],
          description:
            'Number of ridges to add. A number or a hyphen-delimited range string like "2-4".',
        },
        height: {
          type: ["number", "string"],
          description:
            'Ridge height. A number or a hyphen-delimited range string like "40-55".',
        },
        rangeX: {
          type: "string",
          description: `Placement range along the X axis (min-max, 0–100). Default "${DEFAULT_RANGE_X}".`,
        },
        rangeY: {
          type: "string",
          description: `Placement range along the Y axis (min-max, 0–100). Default "${DEFAULT_RANGE_Y}".`,
        },
      },
      required: ["count", "height"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        count?: unknown;
        height?: unknown;
        rangeX?: unknown;
        rangeY?: unknown;
      };

      const count = coerceCountOrHeight("count", input.count);
      if (typeof count !== "string") return errorResult(count.error);

      const height = coerceCountOrHeight("height", input.height);
      if (typeof height !== "string") return errorResult(height.error);

      const rangeX = coerceRange("rangeX", input.rangeX, DEFAULT_RANGE_X);
      if (typeof rangeX !== "string") return errorResult(rangeX.error);

      const rangeY = coerceRange("rangeY", input.rangeY, DEFAULT_RANGE_Y);
      if (typeof rangeY !== "string") return errorResult(rangeY.error);

      try {
        runtime.addRange(count, height, rangeX, rangeY);
        return okResult({ count, height, rangeX, rangeY });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addRangeTool = createAddRangeTool();
