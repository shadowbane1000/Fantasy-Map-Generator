import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor paint/brush single-cell write — parallels the scalar
 * assignment that the brush handlers perform inside `changeHeightForSelection`
 * (`public/modules/ui/heightmap-editor.js:715+`) and the image-converter path
 * at `public/modules/ui/heightmap-editor.js:1429`:
 *
 *   grid.cells.h[i] = height;
 *
 * `grid.cells.h` is a `Uint8Array`, so valid values are integers in [0, 100].
 * This tool bypasses `HeightmapGenerator` entirely — it's a direct scalar
 * mutation, mirroring the one-cell brush application. Does NOT redraw.
 */
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 100;

export interface SetCellHeightRuntime {
  set(cell: number, height: number): { previousHeight: number };
}

interface GridLike {
  cells: {
    h: ArrayLike<number> & { [i: number]: number; length: number };
    i?: ArrayLike<number> & { length: number };
  };
}

export const defaultSetCellHeightRuntime: SetCellHeightRuntime = {
  set(cell, height): { previousHeight: number } {
    const grid = getGlobal<GridLike>("grid");
    if (!grid || !grid.cells || !grid.cells.h) {
      throw new Error(
        "window.grid is not available yet; the map has not finished initial loading.",
      );
    }

    const heights = grid.cells.h;
    const length =
      grid.cells.i && typeof grid.cells.i.length === "number"
        ? grid.cells.i.length
        : heights.length;

    if (cell < 0 || cell >= length) {
      throw new Error(
        `cell index ${cell} is out of bounds (valid range: [0, ${length - 1}]).`,
      );
    }

    const previousHeight = heights[cell];
    heights[cell] = height;
    return { previousHeight };
  },
};

function validateInteger(
  name: string,
  raw: unknown,
  min: number,
  max: number,
): number | string {
  if (raw === undefined || raw === null) {
    return `${name} is required.`;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return `${name} must be a finite number.`;
  }
  if (!Number.isInteger(raw)) {
    return `${name} must be an integer.`;
  }
  if (raw < min || raw > max) {
    return `${name} must be in the range [${min}, ${max}].`;
  }
  return raw;
}

export function createSetCellHeightTool(
  runtime: SetCellHeightRuntime = defaultSetCellHeightRuntime,
): Tool {
  return {
    name: "set_cell_height",
    description:
      'Set the height of a single grid cell — the same side-effect as one stroke of the Heightmap Editor\'s paint/brush tool (`grid.cells.h[cell] = height`, as in `changeHeightForSelection` and the image-converter conversion step). Direct scalar mutation — no HeightmapGenerator round-trip, no redraw. Required `cell` (integer, 0 to grid.cells.i.length-1 — the index into the pre-Voronoi grid, not the packed `pack.cells`). Required `height` (integer in [0, 100]; `grid.cells.h` is a `Uint8Array`). Useful for precise terrain adjustments — raising a single valley floor, lowering one peak, etc. For bulk edits use `clear_heightmap` (flood-fill), `modify_heightmap` (arithmetic over a range), or the brush-style tools like `add_hill` / `add_pit`. Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-edit heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Returns `{cell, previousHeight, height}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        cell: {
          type: "number",
          minimum: 0,
          description:
            "Grid cell index (integer, 0 to grid.cells.i.length-1). This is the pre-Voronoi `grid.cells` index, not the packed `pack.cells` index.",
        },
        height: {
          type: "number",
          minimum: HEIGHT_MIN,
          maximum: HEIGHT_MAX,
          description: `Target height for the cell. Integer in [${HEIGHT_MIN}, ${HEIGHT_MAX}]. 0 = deepest ocean, ${HEIGHT_MAX} = highest peak. 20 is the land/sea threshold.`,
        },
      },
      required: ["cell", "height"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        cell?: unknown;
        height?: unknown;
      };

      const cell = validateInteger(
        "cell",
        input.cell,
        0,
        Number.MAX_SAFE_INTEGER,
      );
      if (typeof cell === "string") return errorResult(cell);

      const height = validateInteger(
        "height",
        input.height,
        HEIGHT_MIN,
        HEIGHT_MAX,
      );
      if (typeof height === "string") return errorResult(height);

      try {
        const { previousHeight } = runtime.set(cell, height);
        return okResult({ cell, previousHeight, height });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const setCellHeightTool = createSetCellHeightTool();
