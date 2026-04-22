import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RemoveBurgRef {
  i: number;
  name: string;
  isCapital: boolean;
}

export interface BurgRemovalRuntime {
  find(ref: number | string): RemoveBurgRef | null;
  remove(i: number): void;
}

interface BurgsModule {
  remove?: (id: number) => void;
}

export const defaultBurgRemovalRuntime: BurgRemovalRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      isCapital: !!entry.capital,
    };
  },
  remove(i: number): void {
    const burgsModule = getGlobal<BurgsModule>("Burgs");
    const remove = burgsModule?.remove;
    if (typeof remove !== "function") {
      throw new Error(
        "Burgs.remove is not available yet; wait for the map to finish loading.",
      );
    }
    remove(i);
  },
};

export function createRemoveBurgTool(
  runtime: BurgRemovalRuntime = defaultBurgRemovalRuntime,
): Tool {
  return {
    name: "remove_burg",
    description:
      "Delete a burg from the map (same side-effect as the Burg Editor's Remove button). Refuses to remove capitals — call set_state_capital first to pick a new one. Also clears the burg's cell link, note, emblem, and SVG icon/label.",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description:
            "Numeric burg id (> 0) or the burg's current case-insensitive name.",
        },
      },
      required: ["burg"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { burg?: unknown };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult("Cannot remove burg 0 (the placeholder entry).");
      }
      if (current.isCapital) {
        return errorResult(
          `Burg ${current.i} (${JSON.stringify(current.name)}) is a state capital; promote a different burg first with set_state_capital.`,
        );
      }

      try {
        runtime.remove(current.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ i: current.i, name: current.name });
    },
  };
}

export const removeBurgTool = createRemoveBurgTool();
