import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Heightmap Editor "Modify" step — kept verbatim from
 * `public/modules/ui/heightmap-editor.js:768` (`rescaleWithCondition`):
 *
 *   HeightmapGenerator.setGraph(grid);
 *   HeightmapGenerator.modify(range, add, mult, power);
 *   grid.cells.h = HeightmapGenerator.getHeights();
 *
 * `modify` signature (`src/modules/heightmap-generator.ts:486`):
 *   modify(range: string, add: number, mult: number, power?: number)
 *
 * - `range` selects which cells are touched by height. Three flavours:
 *   * `"all"` → all cells (min 0, max 100).
 *   * `"land"` → cells with `h >= 20`; also floors the result at 20 so land
 *     never dips below sea level.
 *   * `"<min>-<max>"` → e.g. `"20-100"` — only cells where `min <= h <= max`.
 * - `add` is applied first, `mult` second (skipped when `=== 1`), `power`
 *   third (skipped when falsy / undefined). Result is clamped to [0, 100]
 *   via `lim`.
 */
const DEFAULT_ADD = 0;
const DEFAULT_MULT = 1;

export interface ModifyHeightmapRuntime {
  modify(
    range: string,
    add: number,
    mult: number,
    power: number | undefined,
  ): { cellsChanged: number };
}

interface HeightmapGeneratorLike {
  setGraph(graph: unknown): void;
  modify(range: string, add: number, mult: number, power?: number): void;
  getHeights(): ArrayLike<number> | null | undefined;
}

interface GridLike {
  cells: { h: ArrayLike<number> & { [i: number]: number } };
}

export const defaultModifyHeightmapRuntime: ModifyHeightmapRuntime = {
  modify(range, add, mult, power): { cellsChanged: number } {
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
      typeof heightmap.modify !== "function" ||
      typeof heightmap.getHeights !== "function"
    ) {
      throw new Error(
        "window.HeightmapGenerator is not available yet; the map has not finished initial loading.",
      );
    }

    const before = Array.from(grid.cells.h);

    heightmap.setGraph(grid);
    heightmap.modify(range, add, mult, power);
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

function coerceRangeString(raw: unknown): string | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: "range is required." };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { error: "range must be a finite number or range string." };
    }
    return String(raw);
  }
  if (typeof raw === "string") {
    if (raw.trim().length === 0) {
      return { error: "range must be a non-empty string." };
    }
    return raw;
  }
  return {
    error: 'range must be a string like "all", "land", or "20-100".',
  };
}

function validateOptionalFiniteNumber(
  name: string,
  raw: unknown,
  fallback: number | undefined,
): number | undefined | { error: string } {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { error: `${name} must be a finite number.` };
  }
  return raw;
}

function isIdentity(
  add: number,
  mult: number,
  power: number | undefined,
): boolean {
  const addIsIdentity = add === 0;
  const multIsIdentity = mult === 1;
  // `modify` skips the power branch when `power` is falsy (undefined, 0) and
  // power=1 is an effective no-op on top of the existing clamp.
  const powerIsIdentity = power === undefined || power === 0 || power === 1;
  return addIsIdentity && multIsIdentity && powerIsIdentity;
}

export function createModifyHeightmapTool(
  runtime: ModifyHeightmapRuntime = defaultModifyHeightmapRuntime,
): Tool {
  return {
    name: "modify_heightmap",
    description:
      'Apply arithmetic edits to cell heights within a height range — the same side-effect as the Heightmap Editor\'s "Modify" step (`rescaleWithCondition`): `HeightmapGenerator.setGraph(grid)` → `HeightmapGenerator.modify(range, add, mult, power)` → `grid.cells.h = HeightmapGenerator.getHeights()`. `range` is a string selector: `"all"` (every cell), `"land"` (cells with h ≥ 20, also floors results at 20 so land never flips to sea), or a hyphenated pair `"<min>-<max>"` (e.g. `"20-100"` — only cells where min ≤ h ≤ max are touched). Optional `add` (default 0, applied first), `mult` (default 1, applied second, skipped when 1), and `power` (no default, applied third, skipped when falsy). At least one of add / mult / power must differ from identity. Result clamped to [0, 100]. Does NOT auto-regenerate downstream — biomes, rivers, states, etc. still reflect the pre-modify heights until you call `regenerate_map` (or the relevant `regenerate_domain`). Parallels `smooth_heightmap`. Returns `{range, add, mult, power, cellsChanged}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        range: {
          type: ["string", "number"],
          description:
            'Height range selector: "all", "land", or "<min>-<max>" like "20-100". Numbers are coerced to strings.',
        },
        add: {
          type: "number",
          description: `Additive offset applied first. Default ${DEFAULT_ADD}.`,
        },
        mult: {
          type: "number",
          description: `Multiplicative factor applied second (skipped when 1). Default ${DEFAULT_MULT}.`,
        },
        power: {
          type: "number",
          description:
            "Exponent applied third (skipped when falsy / undefined). No default.",
        },
      },
      required: ["range"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        range?: unknown;
        add?: unknown;
        mult?: unknown;
        power?: unknown;
      };

      const range = coerceRangeString(input.range);
      if (typeof range !== "string") return errorResult(range.error);

      const add = validateOptionalFiniteNumber("add", input.add, DEFAULT_ADD);
      if (typeof add === "object") return errorResult(add.error);

      const mult = validateOptionalFiniteNumber(
        "mult",
        input.mult,
        DEFAULT_MULT,
      );
      if (typeof mult === "object") return errorResult(mult.error);

      const power = validateOptionalFiniteNumber(
        "power",
        input.power,
        undefined,
      );
      if (typeof power === "object") return errorResult(power.error);

      // After fallbacks, `add` / `mult` cannot be undefined; narrow for TS.
      const addNum = add as number;
      const multNum = mult as number;
      const powerNum = power as number | undefined;

      if (isIdentity(addNum, multNum, powerNum)) {
        return errorResult(
          "modify_heightmap is a no-op: at least one of add / mult / power must differ from identity (add=0, mult=1, power=undefined|0|1).",
        );
      }

      try {
        const { cellsChanged } = runtime.modify(
          range,
          addNum,
          multNum,
          powerNum,
        );
        return okResult({
          range,
          add: addNum,
          mult: multNum,
          power: powerNum,
          cellsChanged,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const modifyHeightmapTool = createModifyHeightmapTool();
