import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRiverByRef } from "./rename-river";

export interface RiverTypeRef {
  i: number;
  name: string;
  previousType: string | null;
}

export interface RiverTypeRuntime {
  find(ref: number | string): RiverTypeRef | null;
  apply(i: number, type: string): void;
}

interface RiverPackLike {
  rivers?: RawRiver[];
}

export const defaultRiverTypeRuntime: RiverTypeRuntime = {
  find(ref) {
    const river = findRiverByRef(getPack<RiverPackLike>()?.rivers, ref);
    if (!river) return null;
    return {
      i: river.i,
      name: river.name ?? "",
      previousType: river.type ?? null,
    };
  },
  apply(i: number, type: string): void {
    const river = findRiverByRef(getPack<RiverPackLike>()?.rivers, i);
    if (!river) throw new Error(`River ${i} not found.`);
    river.type = type;
  },
};

export function createSetRiverTypeTool(
  runtime: RiverTypeRuntime = defaultRiverTypeRuntime,
): Tool {
  return {
    name: "set_river_type",
    description:
      "Reclassify a river — writes pack.rivers[k].type (same side-effect as the Rivers Editor type field). Free-form text: common values the generator produces are River, Creek, Brook, Stream, Fork, Branch, but any non-empty string is accepted (e.g. Canal, Ravine, Ditch). Rivers match on river.i (non-contiguous ids) or case-insensitive current name; removed rivers are skipped.",
    input_schema: {
      type: "object",
      properties: {
        river: {
          type: ["integer", "string"],
          description:
            "Numeric river id (matches river.i, not array index) or current case-insensitive name.",
        },
        type: {
          type: "string",
          description:
            "New river type. Common values: River, Creek, Brook, Stream, Fork, Branch. Any non-empty string is accepted.",
        },
      },
      required: ["river", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        river?: unknown;
        type?: unknown;
      };

      const refResult = parseEntityRef(input.river, "river");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.type !== "string" || !input.type.trim()) {
        return errorResult("type must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No river found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const type = input.type.trim();
      try {
        runtime.apply(current.i, type);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousType: current.previousType,
        type,
      });
    },
  };
}

export const setRiverTypeTool = createSetRiverTypeTool();
