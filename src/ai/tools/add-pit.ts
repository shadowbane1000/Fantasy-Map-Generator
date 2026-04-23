import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Pit" step default arguments — kept verbatim from
 * `public/modules/ui/heightmap-editor.js:1084` (template executor):
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.addPit(count, height, x, y);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * Note: `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` are defined as NON-exported
 * internal constants. `add-hill.ts` already exports constants of the same
 * name through `src/ai/index.ts`; re-exporting them from this file too
 * would trigger TS2300 "duplicate identifier" at the barrel.
 *
 * All four arguments to `HeightmapGenerator.addPit` are **range strings**
 * consumed by `getNumberInRange` (count / height) and the private
 * `getPointInRange` (rangeX / rangeY). `rangeX` / `rangeY` MUST be strings —
 * `getPointInRange` (`src/modules/heightmap-generator.ts:80`) explicitly
 * checks `typeof range !== "string"` and bails.
 *
 * The generator rejection-samples the start cell until `heights[start] >= 20`
 * (i.e. land), up to 50 attempts; if that fails it silently returns and
 * `cellsChanged` will be 0.
 */
const DEFAULT_RANGE_X = "20-80";
const DEFAULT_RANGE_Y = "20-80";

export interface AddPitRuntime {
  addPit(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
  ): { cellsChanged: number };
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  addPit(count: string, height: string, rangeX: string, rangeY: string): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultAddPitRuntime: AddPitRuntime = {
  addPit(count, height, rangeX, rangeY): { cellsChanged: number } {
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
      typeof heightmap.addPit !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    const before = Array.from(grid.cells.h);

    heightmap.setGraph(grid);
    heightmap.addPit(count, height, rangeX, rangeY);
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

function coerceRangeLikeArg(
  name: string,
  raw: unknown,
): string | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: `${name} is required.` };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { error: `${name} must be a finite number or range string.` };
    }
    return String(raw);
  }
  if (typeof raw === "string") {
    if (raw.trim().length === 0) {
      return { error: `${name} must be a non-empty range string.` };
    }
    return raw;
  }
  return { error: `${name} must be a number or range string (e.g. "3-7").` };
}

function coerceStringRangeArg(
  name: string,
  raw: unknown,
  fallback: string,
): string | { error: string } {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "string") {
    return {
      error: `${name} must be a range string like "20-80" (numbers are not accepted here — HeightmapGenerator.getPointInRange requires a string).`,
    };
  }
  if (raw.trim().length === 0) {
    return { error: `${name} must be a non-empty range string.` };
  }
  return raw;
}

export function createAddPitTool(
  runtime: AddPitRuntime = defaultAddPitRuntime,
): Tool {
  return {
    name: "add_pit",
    description:
      'Add one or more pits (isolated low-elevation depressions / craters) to the terrain heightmap — the same side-effect as the Heightmap Editor\'s \'Pit\' template step: `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.addPit(count, height, rangeX, rangeY)` → `grid.cells.h = HeightmapGenerator.getHeights()`. Parallels `add_hill` but carves downward instead of raising terrain. All four args are **range strings** (`"5"` = literal 5, `"3-7"` = random int in [3, 7], `"-5-10"` = random int in [-5, 10], `"2.5"` = probabilistic round). `count` and `height` accept numbers for convenience (coerced to strings). `rangeX` / `rangeY` MUST be strings (defaults `"20-80"`) — they express placement as a percent-of-axis range. The generator rejection-samples the start cell until it lands on terrain (`h >= 20`), up to 50 attempts; if that fails it silently no-ops for that pit and `cellsChanged` may be 0. Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-pit heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Returns `{count, height, rangeX, rangeY, cellsChanged}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        count: {
          type: ["number", "string"],
          description:
            'How many pits to add. Number (e.g. 3) or range string (e.g. "1-3").',
        },
        height: {
          type: ["number", "string"],
          description:
            'Depth of each pit (0-100 after clamp; higher value = deeper pit). Number (e.g. 50) or range string (e.g. "30-60"). Each pit\'s height is resolved independently.',
        },
        rangeX: {
          type: "string",
          description: `Horizontal placement range, percent-of-width (e.g. "20-80"). Default "${DEFAULT_RANGE_X}". Must be a string.`,
        },
        rangeY: {
          type: "string",
          description: `Vertical placement range, percent-of-height (e.g. "20-80"). Default "${DEFAULT_RANGE_Y}". Must be a string.`,
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

      const count = coerceRangeLikeArg("count", input.count);
      if (typeof count !== "string") return errorResult(count.error);

      const height = coerceRangeLikeArg("height", input.height);
      if (typeof height !== "string") return errorResult(height.error);

      const rangeX = coerceStringRangeArg(
        "rangeX",
        input.rangeX,
        DEFAULT_RANGE_X,
      );
      if (typeof rangeX !== "string") return errorResult(rangeX.error);

      const rangeY = coerceStringRangeArg(
        "rangeY",
        input.rangeY,
        DEFAULT_RANGE_Y,
      );
      if (typeof rangeY !== "string") return errorResult(rangeY.error);

      try {
        const { cellsChanged } = runtime.addPit(count, height, rangeX, rangeY);
        return okResult({ count, height, rangeX, rangeY, cellsChanged });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addPitTool = createAddPitTool();
