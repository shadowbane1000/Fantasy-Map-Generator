import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Invert" step — kept verbatim from
 * `public/modules/ui/heightmap-editor.js:1089`:
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.invert(+count, dist);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * `invert` signature (`src/modules/heightmap-generator.ts:531`):
 *   invert(count: number, axes: string)
 *
 * - `count` is a probability (0-1) — passed through `P(count)` which rolls
 *   Math.random() < count and bails when the roll fails. A value >= 1 always
 *   applies; <= 0 never applies. Default here is 1 so a minimal call always
 *   mirrors.
 * - `axes` chooses which dimension(s) to mirror. The generator branches on
 *   `axes !== "y"` / `axes !== "x"`, so the canonical values pushed by the
 *   Heightmap Editor UI are:
 *     * "x"  → mirror along the X axis only (invertX=true, invertY=false).
 *     * "y"  → mirror along the Y axis only (invertX=false, invertY=true).
 *     * "xy" → mirror both axes (invertX=true, invertY=true) — 180° rotation.
 *   We normalise aliases like "both" / "yx" / case-variants to the canonical
 *   set before forwarding.
 */
const DEFAULT_COUNT = 1;
const COUNT_MIN = 0;
const COUNT_MAX = 1;

type CanonicalAxes = "x" | "y" | "xy";

const AXES_ALIASES: Record<string, CanonicalAxes> = {
  x: "x",
  y: "y",
  xy: "xy",
  yx: "xy",
  both: "xy",
};

export interface InvertHeightmapRuntime {
  invert(count: number, axes: string): { cellsChanged: number };
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  invert(count: number, axes: string): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultInvertHeightmapRuntime: InvertHeightmapRuntime = {
  invert(count, axes): { cellsChanged: number } {
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
      typeof heightmap.invert !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    const before = Array.from(grid.cells.h);

    heightmap.setGraph(grid);
    heightmap.invert(count, axes);
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

function resolveAxes(raw: unknown): CanonicalAxes | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: "axes is required." };
  }
  if (typeof raw !== "string") {
    return {
      error: 'axes must be a string — one of "x", "y", or "xy".',
    };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { error: "axes must be a non-empty string." };
  }
  const normalised = AXES_ALIASES[trimmed.toLowerCase()];
  if (!normalised) {
    return {
      error: `Unknown axes "${raw}". Expected one of "x", "y", or "xy" (aliases: "both", "yx").`,
    };
  }
  return normalised;
}

function validateCount(raw: unknown): number | { error: string } {
  if (raw === undefined || raw === null) return DEFAULT_COUNT;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { error: "count must be a finite number." };
  }
  if (raw < COUNT_MIN || raw > COUNT_MAX) {
    return {
      error: `count must be in the range [${COUNT_MIN}, ${COUNT_MAX}].`,
    };
  }
  return raw;
}

export function createInvertHeightmapTool(
  runtime: InvertHeightmapRuntime = defaultInvertHeightmapRuntime,
): Tool {
  return {
    name: "invert_heightmap",
    description:
      'Mirror the terrain heightmap along one or both axes — the same side-effect as the Heightmap Editor\'s "Invert" step: `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.invert(count, axes)` → `grid.cells.h = HeightmapGenerator.getHeights()`. Required `axes` (string) — one of `"x"` (mirror along X, west↔east), `"y"` (mirror along Y, north↔south), or `"xy"` (mirror both — equivalent to a 180° rotation). Aliases `"both"`, `"yx"`, and case-variants are accepted. Optional `count` (number in [0, 1], default 1) is the **probability** of applying the flip (the generator rolls `Math.random() < count`; 1 always applies, 0 never applies). Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-invert heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Parallels `smooth_heightmap` / `modify_heightmap`. Returns `{count, axes, cellsChanged}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        axes: {
          type: "string",
          description:
            'Which axis / axes to mirror. One of "x" (mirror along X), "y" (mirror along Y), or "xy" (mirror both / 180° rotation). Aliases "both" and "yx" accepted.',
        },
        count: {
          type: "number",
          minimum: COUNT_MIN,
          maximum: COUNT_MAX,
          description: `Probability (0-1) of applying the flip. Default ${DEFAULT_COUNT} (always apply). Matches the legacy UI semantics where count is rolled through P(n).`,
        },
      },
      required: ["axes"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        axes?: unknown;
        count?: unknown;
      };

      const axes = resolveAxes(input.axes);
      if (typeof axes !== "string") return errorResult(axes.error);

      const count = validateCount(input.count);
      if (typeof count !== "number") return errorResult(count.error);

      try {
        const { cellsChanged } = runtime.invert(count, axes);
        return okResult({ count, axes, cellsChanged });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const invertHeightmapTool = createInvertHeightmapTool();
