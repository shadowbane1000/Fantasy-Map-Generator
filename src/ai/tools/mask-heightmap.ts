import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Mask" template step — kept verbatim from
 * `public/modules/ui/heightmap-editor.js:1088`:
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.mask(+count);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * `mask(power = 1)` (`src/modules/heightmap-generator.ts:516`) applies a radial
 * mask to every cell: it multiplies each cell's height by a smooth distance
 * factor that is 1 at the map center and 0 at the edges, then blends against
 * the original height with fraction `fr = |power|` — so `power = 1` is full
 * insulation (map edges pushed to sea level) and larger `|power|` is a softer
 * mask (keeps more of the original height). Negative `power` inverts the
 * effect (0 at center, 1 at edges — depresses the center).
 *
 * The UI bounds `power` in `[-10, 10]` (`heightmap-editor.js:966`); we copy
 * that range here. Shared `DEFAULT_*` / `MASK_POWER_*` constants are
 * deliberately NOT re-exported from `src/ai/index.ts` — fresh re-exports would
 * trip TS2300 against the other heightmap tools.
 */
const DEFAULT_POWER = 1;
const MASK_POWER_MIN = -10;
const MASK_POWER_MAX = 10;

export interface MaskHeightmapRuntime {
  mask(power: number): { cellsChanged: number };
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  mask(power: number): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultMaskHeightmapRuntime: MaskHeightmapRuntime = {
  mask(power): { cellsChanged: number } {
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
      typeof heightmap.mask !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    const before = Array.from(grid.cells.h);

    heightmap.setGraph(grid);
    heightmap.mask(power);
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

export function createMaskHeightmapTool(
  runtime: MaskHeightmapRuntime = defaultMaskHeightmapRuntime,
): Tool {
  return {
    name: "mask_heightmap",
    description:
      'Apply a radial mask to the terrain heightmap — the same side-effect as a "Mask" template step in the Heightmap Editor: `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.mask(power)` → `grid.cells.h = HeightmapGenerator.getHeights()`. The mask multiplies each cell\'s height by a smooth distance factor that is 1 at the map center and 0 at the edges, then blends against the original height with fraction `|power|` — producing an island / continent silhouette. Optional `power` (number in [-10, 10], default 1 — matches the UI): 1 = full insulation (map edges pushed to sea level); larger |power| = softer mask (keeps more of the original height); negative `power` inverts the effect so the *center* is depressed instead of the edges. Run `mask_heightmap({})` to reproduce the button exactly. Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-mask heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Parallels `smooth_heightmap` / `modify_heightmap`. Returns `{power, cellsChanged}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        power: {
          type: "number",
          minimum: MASK_POWER_MIN,
          maximum: MASK_POWER_MAX,
          description: `Masking fraction. Default ${DEFAULT_POWER} (full insulation). Larger |power| = softer mask; negative power inverts the effect so the center is depressed instead of the edges.`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { power?: unknown };

      const power = validateNumber(
        "power",
        input.power,
        MASK_POWER_MIN,
        MASK_POWER_MAX,
        DEFAULT_POWER,
      );
      if (typeof power === "string") return errorResult(power);

      try {
        const { cellsChanged } = runtime.mask(power);
        return okResult({ power, cellsChanged });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const maskHeightmapTool = createMaskHeightmapTool();
