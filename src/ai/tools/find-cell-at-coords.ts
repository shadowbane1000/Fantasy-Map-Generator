import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export type FindCellResult = number | null | "not-ready";

export interface FindCellRuntime {
  findCell(x: number, y: number): FindCellResult;
}

interface PackLike {
  cells?: {
    p?: ArrayLike<[number, number] | undefined>;
  };
}

/**
 * Manual nearest-neighbour scan over `pack.cells.p` — used only when the
 * `window.findCell` global (which wraps a cached d3-quadtree) isn't on the
 * globalThis. Matches the semantics of `findClosestCell` for the default
 * `radius = Infinity` case: returns the index of the cell whose centroid is
 * nearest to (x, y), or `null` when there are no cells.
 */
export function scanPackForNearestCell(
  pack: PackLike | undefined,
  x: number,
  y: number,
): FindCellResult {
  const points = pack?.cells?.p;
  if (!points) return "not-ready";
  const length = points.length;
  if (length === 0) return null;

  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < length; i++) {
    const p = points[i];
    if (!Array.isArray(p)) continue;
    const dx = p[0] - x;
    const dy = p[1] - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? bestIdx : null;
}

export const defaultFindCellRuntime: FindCellRuntime = {
  findCell(x, y): FindCellResult {
    const globals = globalThis as unknown as {
      findCell?: (x: number, y: number, radius?: number) => number | undefined;
      pack?: PackLike;
    };
    const fn = globals.findCell;
    if (typeof fn === "function") {
      try {
        const result = fn(x, y);
        if (typeof result === "number" && Number.isFinite(result)) {
          return result;
        }
        return null;
      } catch {
        // window.findCell throws "Pack cells not found" when the map isn't
        // ready. Fall through to the manual scan so we can report the
        // structured "not-ready" surface.
        return scanPackForNearestCell(globals.pack, x, y);
      }
    }
    return scanPackForNearestCell(globals.pack, x, y);
  },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function createFindCellAtCoordsTool(
  runtime: FindCellRuntime = defaultFindCellRuntime,
): Tool {
  return {
    name: "find_cell_at_coords",
    description:
      "Look up the packed-grid cell index at a given SVG pixel coordinate (x, y). Delegates to `window.findCell(x, y)` from `src/utils/index.ts`, which walks a cached d3-quadtree over `pack.cells.p`; when the global isn't available the tool falls back to a manual nearest-neighbour scan of `pack.cells.p`. Coordinates share the same SVG-pixel space as burg / marker `x` / `y` (0..graphWidth × 0..graphHeight) but may be outside that box — the nearest cell is still returned. Useful as the inverse of `get_cell_info`: convert a click / coordinate into a cell index so you can describe the spot or target it with `add_burg`, `add_marker`, `set_cell_height`, etc. Errors on missing / non-finite `x` / `y` and on an un-generated map. Returns `{cell, x, y}`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        x: {
          type: "number",
          description:
            "X coordinate in SVG pixel space (same units as burg.x / marker.x).",
        },
        y: {
          type: "number",
          description:
            "Y coordinate in SVG pixel space (same units as burg.y / marker.y).",
        },
      },
      required: ["x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { x?: unknown; y?: unknown };
      if (!isFiniteNumber(input.x)) {
        return errorResult("x is required and must be a finite number.");
      }
      if (!isFiniteNumber(input.y)) {
        return errorResult("y is required and must be a finite number.");
      }
      const { x, y } = input;
      const result = runtime.findCell(x, y);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
          { x, y },
        );
      }
      if (result === null) {
        return errorResult(`No cell found at (${x}, ${y}).`, { x, y });
      }
      return okResult({ cell: result, x, y });
    },
  };
}

export const findCellAtCoordsTool = createFindCellAtCoordsTool();
