import { errorResult, getGlobal, okResult } from "./_shared";
import { DEFAULT_RANGE_X, DEFAULT_RANGE_Y } from "./add-hill";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Trough" step — mirrors the handler in
 * `public/modules/ui/heightmap-editor.js:1086`:
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.addTrough(count, height, x, y);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * A trough is a linear depression / valley — the inverse of a Range. All four
 * arguments are **range strings** (see add-hill.ts for the grammar). `rangeX` /
 * `rangeY` MUST be strings — `getPointInRange`
 * (`src/modules/heightmap-generator.ts:80`) bails if given a non-string.
 *
 * `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` are imported from `./add-hill` to avoid
 * duplicate re-exports at the `src/ai/index.ts` barrel (would trip TS2300).
 */

export interface AddTroughRuntime {
  addTrough(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
  ): { cellsChanged: number };
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  addTrough(
    count: string,
    height: string,
    rangeX: string,
    rangeY: string,
  ): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultAddTroughRuntime: AddTroughRuntime = {
  addTrough(count, height, rangeX, rangeY): { cellsChanged: number } {
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
      typeof heightmap.addTrough !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    const before = Array.from(grid.cells.h);

    heightmap.setGraph(grid);
    heightmap.addTrough(count, height, rangeX, rangeY);
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

export function createAddTroughTool(
  runtime: AddTroughRuntime = defaultAddTroughRuntime,
): Tool {
  return {
    name: "add_trough",
    description:
      'Add one or more troughs (linear depressions / valleys) to the terrain heightmap — the same side-effect as a "Trough" step in the Heightmap Editor template: `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.addTrough(count, height, rangeX, rangeY)` → `grid.cells.h = HeightmapGenerator.getHeights()`. A trough is the inverse of a Range — it carves a ridge-shaped dip. All four args are **range strings** (`"5"` = literal 5, `"3-7"` = random int in [3, 7], `"-5-10"` = random int in [-5, 10], `"2.5"` = probabilistic round). Required `count` (number or range string — how many troughs). Required `height` (number or range string — each trough\'s depth magnitude). Optional `rangeX` / `rangeY` (strings, default `"20-80"` each — percent-of-axis placement ranges; must be strings because `HeightmapGenerator.getPointInRange` refuses numbers). Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-trough heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Parallels `add_range` / `add_hill`. Returns `{count, height, rangeX, rangeY, cellsChanged}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        count: {
          type: ["number", "string"],
          description:
            'How many troughs to carve. Number (e.g. 2) or range string (e.g. "1-3").',
        },
        height: {
          type: ["number", "string"],
          description:
            'Depth magnitude of each trough. Number (e.g. 40) or range string (e.g. "30-60"). Each trough\'s value is resolved independently.',
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
        const { cellsChanged } = runtime.addTrough(
          count,
          height,
          rangeX,
          rangeY,
        );
        return okResult({ count, height, rangeX, rangeY, cellsChanged });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addTroughTool = createAddTroughTool();
