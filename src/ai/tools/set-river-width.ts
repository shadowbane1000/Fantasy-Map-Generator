import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRiverByRef } from "./rename-river";

interface RiverPackLike {
  rivers?: RawRiver[];
}

export const SOURCE_WIDTH_MIN = 0;
export const SOURCE_WIDTH_MAX = 3;
export const WIDTH_FACTOR_MIN = 0.1;
export const WIDTH_FACTOR_MAX = 4;

export const DEFAULT_RIVER_SOURCE_WIDTH = 0;
export const DEFAULT_RIVER_WIDTH_FACTOR = 1;

export interface RiverWidthRef {
  i: number;
  name: string;
  previousSourceWidth: number;
  previousWidthFactor: number;
}

export interface RiverWidthPatch {
  sourceWidth?: number;
  widthFactor?: number;
}

export interface RiverWidthRuntime {
  find(ref: number | string): RiverWidthRef | null;
  apply(i: number, patch: RiverWidthPatch): void;
}

export const defaultRiverWidthRuntime: RiverWidthRuntime = {
  find(ref) {
    const river = findRiverByRef(getPack<RiverPackLike>()?.rivers, ref);
    if (!river) return null;
    return {
      i: river.i,
      name: river.name ?? "",
      previousSourceWidth:
        typeof river.sourceWidth === "number"
          ? river.sourceWidth
          : DEFAULT_RIVER_SOURCE_WIDTH,
      previousWidthFactor:
        typeof river.widthFactor === "number"
          ? river.widthFactor
          : DEFAULT_RIVER_WIDTH_FACTOR,
    };
  },
  apply(i, patch) {
    const rivers = getPack<RiverPackLike>()?.rivers;
    if (!Array.isArray(rivers)) {
      throw new Error("pack.rivers is not available.");
    }
    const river = findRiverByRef(rivers, i);
    if (!river) throw new Error(`River ${i} not found.`);
    if (patch.sourceWidth !== undefined) {
      (river as RawRiver).sourceWidth = patch.sourceWidth;
    }
    if (patch.widthFactor !== undefined) {
      (river as RawRiver).widthFactor = patch.widthFactor;
    }
  },
};

export function createSetRiverWidthTool(
  runtime: RiverWidthRuntime = defaultRiverWidthRuntime,
): Tool {
  return {
    name: "set_river_width",
    description: `Tune a river's width profile — same side-effect as the Rivers Editor's Source Width and Width Factor inputs. \`sourceWidth\` (range [${SOURCE_WIDTH_MIN}, ${SOURCE_WIDTH_MAX}]) is the starting width at the river's source; \`widthFactor\` (range [${WIDTH_FACTOR_MIN}, ${WIDTH_FACTOR_MAX}]) controls how quickly width grows along the course. At least one of the two is required. This tool is data-only: it writes the fields without recomputing the cached \`river.width\` or redrawing the river's SVG path — the UI will refresh width on next open or the next full river-layer regen. Idempotent.`,
    input_schema: {
      type: "object",
      properties: {
        river: {
          type: ["integer", "string"],
          description: "Numeric river id (> 0) or case-insensitive name.",
        },
        sourceWidth: {
          type: "number",
          minimum: SOURCE_WIDTH_MIN,
          maximum: SOURCE_WIDTH_MAX,
          description: `Optional. Starting width at the source; range [${SOURCE_WIDTH_MIN}, ${SOURCE_WIDTH_MAX}].`,
        },
        widthFactor: {
          type: "number",
          minimum: WIDTH_FACTOR_MIN,
          maximum: WIDTH_FACTOR_MAX,
          description: `Optional. Width growth factor; range [${WIDTH_FACTOR_MIN}, ${WIDTH_FACTOR_MAX}].`,
        },
      },
      required: ["river"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        river?: unknown;
        sourceWidth?: unknown;
        widthFactor?: unknown;
      };

      const refResult = parseEntityRef(input.river, "river");
      if (!refResult.ok) return errorResult(refResult.error);

      const hasSource =
        input.sourceWidth !== undefined && input.sourceWidth !== null;
      const hasFactor =
        input.widthFactor !== undefined && input.widthFactor !== null;
      if (!hasSource && !hasFactor) {
        return errorResult(
          "at least one of sourceWidth / widthFactor is required.",
        );
      }

      let sourceWidth: number | undefined;
      if (hasSource) {
        if (
          typeof input.sourceWidth !== "number" ||
          !Number.isFinite(input.sourceWidth)
        ) {
          return errorResult("sourceWidth must be a finite number.");
        }
        if (
          input.sourceWidth < SOURCE_WIDTH_MIN ||
          input.sourceWidth > SOURCE_WIDTH_MAX
        ) {
          return errorResult(
            `sourceWidth must be in the range [${SOURCE_WIDTH_MIN}, ${SOURCE_WIDTH_MAX}].`,
          );
        }
        sourceWidth = input.sourceWidth;
      }

      let widthFactor: number | undefined;
      if (hasFactor) {
        if (
          typeof input.widthFactor !== "number" ||
          !Number.isFinite(input.widthFactor)
        ) {
          return errorResult("widthFactor must be a finite number.");
        }
        if (
          input.widthFactor < WIDTH_FACTOR_MIN ||
          input.widthFactor > WIDTH_FACTOR_MAX
        ) {
          return errorResult(
            `widthFactor must be in the range [${WIDTH_FACTOR_MIN}, ${WIDTH_FACTOR_MAX}].`,
          );
        }
        widthFactor = input.widthFactor;
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No river found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const sourceMatches =
        sourceWidth === undefined ||
        sourceWidth === current.previousSourceWidth;
      const factorMatches =
        widthFactor === undefined ||
        widthFactor === current.previousWidthFactor;
      if (sourceMatches && factorMatches) {
        return okResult({
          i: current.i,
          name: current.name,
          sourceWidth: sourceWidth ?? current.previousSourceWidth,
          widthFactor: widthFactor ?? current.previousWidthFactor,
          previousSourceWidth: current.previousSourceWidth,
          previousWidthFactor: current.previousWidthFactor,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, { sourceWidth, widthFactor });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        sourceWidth: sourceWidth ?? current.previousSourceWidth,
        widthFactor: widthFactor ?? current.previousWidthFactor,
        previousSourceWidth: current.previousSourceWidth,
        previousWidthFactor: current.previousWidthFactor,
        noop: false,
      });
    },
  };
}

export const setRiverWidthTool = createSetRiverWidthTool();
