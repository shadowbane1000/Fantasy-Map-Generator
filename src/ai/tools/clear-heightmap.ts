import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Start from scratch" / blank-ocean reset — kept verbatim
 * from `public/modules/ui/heightmap-editor.js:800` (`startFromScratch`):
 *
 *   grid.cells.h = new Uint8Array(grid.cells.i.length);
 *
 * The legacy editor bypasses `HeightmapGenerator` entirely for this op — it
 * just allocates a fresh zero-filled typed array over `grid.cells.h`. We keep
 * the tool equally cheap: iterate over the existing heights array and write
 * the target `height` (default 0) into every index. No generator round-trip
 * required.
 */
const DEFAULT_HEIGHT = 0;
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 100;

export interface ClearHeightmapRuntime {
  clear(height: number): { cellsCleared: number };
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultClearHeightmapRuntime: ClearHeightmapRuntime = {
  clear(height): { cellsCleared: number } {
    const grid = getGlobal<GridLike>("grid");
    if (!grid || !grid.cells || !grid.cells.h) {
      throw new Error(
        "window.grid is not available yet; the map has not finished initial loading.",
      );
    }

    const heights = grid.cells.h;
    const len = heights.length;
    let cellsCleared = 0;
    for (let i = 0; i < len; i++) {
      if (heights[i] !== height) {
        heights[i] = height;
        cellsCleared++;
      }
    }
    return { cellsCleared };
  },
};

function validateHeight(raw: unknown): number | { error: string } {
  if (raw === undefined || raw === null) return DEFAULT_HEIGHT;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { error: "height must be a finite number." };
  }
  if (raw < HEIGHT_MIN || raw > HEIGHT_MAX) {
    return {
      error: `height must be in the range [${HEIGHT_MIN}, ${HEIGHT_MAX}].`,
    };
  }
  return raw;
}

export function createClearHeightmapTool(
  runtime: ClearHeightmapRuntime = defaultClearHeightmapRuntime,
): Tool {
  return {
    name: "clear_heightmap",
    description:
      'Reset the terrain heightmap to a blank ocean — the same side-effect as clicking the Heightmap Editor\'s "Clear" / "Start from scratch" brush (`startFromScratch`). Walks `grid.cells.h` and writes the target height into every cell. Useful as a clean slate before building terrain bottom-up with `add_hill` / `add_range` / `add_pit` / `add_trough` / `add_strait`. Optional `height` (number in [0, 100], default 0 — sea level / blank ocean). Passing e.g. `height: 20` floods every cell to exactly sea level (the land threshold). Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-clear heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Parallels `smooth_heightmap` / `modify_heightmap` / `invert_heightmap`. Returns `{height, cellsCleared}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        height: {
          type: "number",
          minimum: HEIGHT_MIN,
          maximum: HEIGHT_MAX,
          description: `Height to write into every cell. Default ${DEFAULT_HEIGHT} (blank ocean). Must be in [${HEIGHT_MIN}, ${HEIGHT_MAX}].`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { height?: unknown };

      const height = validateHeight(input.height);
      if (typeof height !== "number") return errorResult(height.error);

      try {
        const { cellsCleared } = runtime.clear(height);
        return okResult({ height, cellsCleared });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const clearHeightmapTool = createClearHeightmapTool();
