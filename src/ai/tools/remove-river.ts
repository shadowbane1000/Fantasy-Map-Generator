import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRiverByRef } from "./rename-river";

export interface RemoveRiverRef {
  i: number;
  name: string;
  type: string;
}

export interface RiverRemovalRuntime {
  find(ref: number | string): RemoveRiverRef | null;
  remove(id: number): void;
}

interface RiverPackLike {
  rivers?: RawRiver[];
}

interface RiversModule {
  remove?: (id: number) => void;
}

export const defaultRiverRemovalRuntime: RiverRemovalRuntime = {
  find(ref) {
    const river = findRiverByRef(getPack<RiverPackLike>()?.rivers, ref);
    if (!river) return null;
    return {
      i: river.i,
      name: river.name ?? "",
      type: river.type ?? "",
    };
  },
  remove(id: number): void {
    const riversModule = getGlobal<RiversModule>("Rivers");
    if (typeof riversModule?.remove !== "function") {
      throw new Error(
        "Rivers.remove is not available yet; wait for the map to finish loading.",
      );
    }
    const river = findRiverByRef(getPack<RiverPackLike>()?.rivers, id);
    if (!river) {
      throw new Error(`River ${id} not found.`);
    }
    riversModule.remove(id);
  },
};

export function createRemoveRiverTool(
  runtime: RiverRemovalRuntime = defaultRiverRemovalRuntime,
): Tool {
  return {
    name: "remove_river",
    description:
      "Delete a river — delegates to the generator's Rivers.remove() so the full side-effect chain from the Rivers Editor's 'Remove river and tributaries' dialog runs: the target river AND all tributaries (rivers whose parent or basin is the target) are pruned from pack.rivers, every cell that referenced any removed river is cleared (cells.r = 0, cells.fl reset to grid precipitation, cells.conf = 0), and each #river{i} SVG path is removed. Matches by numeric river.i (non-contiguous ids) or case-insensitive current name; already-removed rivers are skipped. The UI's confirm dialog is skipped since tools run non-interactively.",
    input_schema: {
      type: "object",
      properties: {
        river: {
          type: ["integer", "string"],
          description:
            "Numeric river id (matches river.i, not array index) or current case-insensitive name.",
        },
      },
      required: ["river"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { river?: unknown };

      const refResult = parseEntityRef(input.river, "river");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No river found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.remove(current.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        previousType: current.type,
      });
    },
  };
}

export const removeRiverTool = createRemoveRiverTool();
