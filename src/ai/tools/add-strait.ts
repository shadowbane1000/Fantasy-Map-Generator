import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Strait" step — mirrors the handler in
 * `public/modules/ui/heightmap-editor.js:1087`:
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.addStrait(width, direction);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * A strait carves a water channel (depresses heights along a line) across the
 * map terrain. Unlike `add_hill` / `add_pit` / `add_range` / `add_trough`, the
 * signature is only two args:
 *   - `width`      — range string (`"5"`, `"2-7"`, `"2.5"`, …)
 *   - `direction`  — `"vertical"` (default) or `"horizontal"`
 *
 * No `count`/`height`/`rangeX`/`rangeY` here — the start/end points are picked
 * deterministically from `direction` inside `HeightmapGenerator.addStrait`
 * (`src/modules/heightmap-generator.ts:412`).
 *
 * Shared `DEFAULT_RANGE_X` / `DEFAULT_RANGE_Y` constants are deliberately NOT
 * re-imported or re-exported from this file — they are unused here, and adding
 * new re-exports at the `src/ai/index.ts` barrel would trip TS2300.
 */

export const STRAIT_DIRECTIONS = ["vertical", "horizontal"] as const;
export type StraitDirection = (typeof STRAIT_DIRECTIONS)[number];
export const DEFAULT_STRAIT_DIRECTION: StraitDirection = "vertical";

export interface AddStraitRuntime {
  addStrait(width: string, direction: string): { cellsChanged: number };
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  addStrait(width: string, direction: string): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultAddStraitRuntime: AddStraitRuntime = {
  addStrait(width, direction): { cellsChanged: number } {
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
      typeof heightmap.addStrait !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    const before = Array.from(grid.cells.h);

    heightmap.setGraph(grid);
    heightmap.addStrait(width, direction);
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

function coerceWidth(raw: unknown): string | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: "width is required." };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { error: "width must be a finite number or range string." };
    }
    return String(raw);
  }
  if (typeof raw === "string") {
    if (raw.trim().length === 0) {
      return { error: "width must be a non-empty range string." };
    }
    return raw;
  }
  return { error: 'width must be a number or range string (e.g. "2-7").' };
}

function coerceDirection(raw: unknown): StraitDirection | { error: string } {
  if (raw === undefined || raw === null) return DEFAULT_STRAIT_DIRECTION;
  if (typeof raw !== "string") {
    return {
      error: 'direction must be the string "vertical" or "horizontal".',
    };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "vertical" || normalized === "horizontal") {
    return normalized;
  }
  return {
    error: `direction must be "vertical" or "horizontal" (got ${JSON.stringify(raw)}).`,
  };
}

export function createAddStraitTool(
  runtime: AddStraitRuntime = defaultAddStraitRuntime,
): Tool {
  return {
    name: "add_strait",
    description:
      'Carve a strait (water channel) across the terrain heightmap — the same side-effect as a "Strait" step in the Heightmap Editor template: `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.addStrait(width, direction)` → `grid.cells.h = HeightmapGenerator.getHeights()`. Unlike sibling `add_hill` / `add_pit` / `add_range` / `add_trough`, the signature is only two args: `width` (required — a **range string** like `"5"` = literal 5, `"2-7"` = random int in [2, 7], `"2.5"` = probabilistic round; numbers are accepted and coerced to string) and `direction` (optional — `"vertical"` (default) or `"horizontal"`). The generator picks the strait\'s start and end points deterministically from `direction` (vertical runs top-to-bottom, horizontal runs left-to-right), so there are no rangeX / rangeY knobs. Internally the width is clamped to `grid.cellsX / 3`. Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-strait heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Returns `{width, direction, cellsChanged}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        width: {
          type: ["number", "string"],
          description:
            'Strait width. Number (e.g. 4) or range string (e.g. "2-7"). Clamped internally to `grid.cellsX / 3`.',
        },
        direction: {
          type: "string",
          enum: [...STRAIT_DIRECTIONS],
          description: `Direction the strait runs across the map. "vertical" (default) runs top-to-bottom, "horizontal" runs left-to-right.`,
        },
      },
      required: ["width"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        width?: unknown;
        direction?: unknown;
      };

      const width = coerceWidth(input.width);
      if (typeof width !== "string") return errorResult(width.error);

      const direction = coerceDirection(input.direction);
      if (typeof direction !== "string") return errorResult(direction.error);

      try {
        const { cellsChanged } = runtime.addStrait(width, direction);
        return okResult({ width, direction, cellsChanged });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addStraitTool = createAddStraitTool();
