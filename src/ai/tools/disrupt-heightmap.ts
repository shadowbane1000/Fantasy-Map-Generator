import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Disrupt all" brush — kept verbatim from
 * `public/modules/ui/heightmap-editor.js:795` (`disruptAllHeights`):
 *
 *   grid.cells.h = grid.cells.h.map(h => (h < 15 ? h : lim(h + 2.5 - Math.random() * 4)));
 *   updateHeightmap();
 *
 * Behavior:
 *  - Water cells (`h < 15`) are left untouched.
 *  - Land cells (`h >= 15`) get a random offset in `(-1.5, +2.5]` added,
 *    then clamped to `[0, 100]` via the global `lim` (`src/utils/numberUtils.ts:28`).
 *  - The result REASSIGNS `grid.cells.h` to a NEW typed array — the typed-array
 *    `.map` returns a new `Uint8Array` of the same kind, with values floored
 *    when stored. We mirror this exactly via `setGridHeights(arr)` on the runtime.
 *  - Best-effort `updateHeightmap()` for the redraw — the editor's closure
 *    is not exposed on `globalThis` today, so this silently no-ops in
 *    production. Same posture as the sibling `smooth_heightmap` /
 *    `clear_heightmap` / `mask_heightmap` / `invert_heightmap` tools.
 *
 * Note on the water boundary: `lim` clamps to `[0, 100]`, NOT `[15, 100]`.
 * A land cell with `h=15` plus `delta=-1.5` becomes `13.5` (stored as `13`
 * in the Uint8Array), so a land cell CAN cross the water boundary downward
 * as a result of the disrupt. We preserve this exactly.
 */

const WATER_THRESHOLD = 15;
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 100;
const DELTA_BASE = 2.5;
const DELTA_RANGE = 4;

interface HeightArrayLike extends ArrayLike<number> {
  readonly length: number;
  [i: number]: number;
  map(fn: (h: number, i: number) => number): HeightArrayLike;
}

interface GridLike {
  cells: { h: HeightArrayLike };
}

export interface DisruptHeightmapRuntime {
  /** Read the current `grid.cells.h` typed array. Throws when missing. */
  getGridHeights(): HeightArrayLike;
  /** Reassign `grid.cells.h = next` (mirrors the legacy semantic). */
  setGridHeights(next: HeightArrayLike): void;
  /** Random in [0, 1). Indirection for deterministic tests. */
  random(): number;
  /** Clamp `v` to `[min, max]`. Uses the global `lim` when available. */
  clamp(v: number, min: number, max: number): number;
  /** Best-effort renderer hook — must not throw. */
  updateHeightmap(): void;
}

export const defaultDisruptHeightmapRuntime: DisruptHeightmapRuntime = {
  getGridHeights(): HeightArrayLike {
    const grid = getGlobal<GridLike>("grid");
    if (
      !grid ||
      !grid.cells ||
      !grid.cells.h ||
      typeof grid.cells.h.length !== "number"
    ) {
      throw new Error(
        "window.grid.cells.h is not available; the map hasn't finished loading.",
      );
    }
    return grid.cells.h;
  },
  setGridHeights(next): void {
    const grid = getGlobal<GridLike>("grid");
    if (!grid || !grid.cells) {
      throw new Error(
        "window.grid.cells.h is not available; the map hasn't finished loading.",
      );
    }
    (grid.cells as { h: HeightArrayLike }).h = next;
  },
  random(): number {
    return Math.random();
  },
  clamp(v, min, max): number {
    const lim = getGlobal<(value: number) => number>("lim");
    if (typeof lim === "function") {
      // Global `lim` always clamps to [0, 100]; we still compute through it.
      return lim(v);
    }
    return Math.min(Math.max(v, min), max);
  },
  updateHeightmap(): void {
    const fn = getGlobal<() => void>("updateHeightmap");
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch {
      // best-effort — disrupt itself succeeded
    }
  },
};

export function createDisruptHeightmapTool(
  runtime: DisruptHeightmapRuntime = defaultDisruptHeightmapRuntime,
): Tool {
  return {
    name: "disrupt_heightmap",
    description:
      'Add random noise to every land cell\'s terrain height — the same side-effect as clicking the Heightmap Editor\'s "Disrupt all" brush (`disruptAllHeights`). Walks `grid.cells.h` and adds a random offset in `(-1.5, +2.5]` to each land cell (cells with `h >= 15`), clamped to `[0, 100]` via `lim()`. Water cells (`h < 15`) are left untouched. **Reassigns** `grid.cells.h` to a new typed array (mirrors the legacy `grid.cells.h = grid.cells.h.map(...)` semantic — the typed-array `.map` returns a NEW `Uint8Array`; downstream callers that captured the old reference will not see the changes). Useful for breaking up overly smooth terrain after `smooth_heightmap`, or for adding micro-variation before re-running biome / river generation. Note: `lim` clamps to `[0, 100]`, NOT `[15, 100]`, so a land cell near the water boundary CAN downcross to `< 15` after the disrupt — preserved verbatim from the legacy editor. Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-disrupt heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Parallels `smooth_heightmap` / `mask_heightmap` / `invert_heightmap` / `clear_heightmap`. Takes no input. Returns `{land_cells, water_cells, min_delta, max_delta, mean_abs_delta}` (deltas are computed over the BEFORE-classified land cells; all zero when there are no land cells). Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      let before: HeightArrayLike;
      try {
        before = runtime.getGridHeights();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const len = before.length;

      // Snapshot the BEFORE values so the reassignment doesn't mutate our
      // delta inputs, AND classify each cell.
      const beforeSnapshot = new Array<number>(len);
      const isLand = new Array<boolean>(len);
      let landCells = 0;
      let waterCells = 0;
      for (let i = 0; i < len; i++) {
        const h = before[i];
        beforeSnapshot[i] = h;
        if (h < WATER_THRESHOLD) {
          isLand[i] = false;
          waterCells++;
        } else {
          isLand[i] = true;
          landCells++;
        }
      }

      let next: HeightArrayLike;
      try {
        // Use the typed-array `.map` so we get a NEW typed array of the same
        // kind (Uint8Array → Uint8Array). For the unit-test fake (a plain
        // Array), `.map` returns a plain Array of the same length — also fine.
        next = before.map((h: number, _i: number) =>
          h < WATER_THRESHOLD
            ? h
            : runtime.clamp(
                h + DELTA_BASE - runtime.random() * DELTA_RANGE,
                HEIGHT_MIN,
                HEIGHT_MAX,
              ),
        );
        runtime.setGridHeights(next);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let minDelta = 0;
      let maxDelta = 0;
      let absDeltaSum = 0;
      if (landCells > 0) {
        let initialised = false;
        for (let i = 0; i < len; i++) {
          if (!isLand[i]) continue;
          const d = next[i] - beforeSnapshot[i];
          if (!initialised) {
            minDelta = d;
            maxDelta = d;
            initialised = true;
          } else {
            if (d < minDelta) minDelta = d;
            if (d > maxDelta) maxDelta = d;
          }
          absDeltaSum += Math.abs(d);
        }
      }
      const meanAbsDelta = landCells > 0 ? absDeltaSum / landCells : 0;

      // Best-effort redraw. Must not surface as a tool error.
      try {
        runtime.updateHeightmap();
      } catch {
        // swallow
      }

      return okResult({
        land_cells: landCells,
        water_cells: waterCells,
        min_delta: minDelta,
        max_delta: maxDelta,
        mean_abs_delta: meanAbsDelta,
      });
    },
  };
}

export const disruptHeightmapTool = createDisruptHeightmapTool();
