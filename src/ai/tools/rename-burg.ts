import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  type Pack,
  parseEntityRef,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface BurgRef {
  i: number;
  name: string;
}

export interface BurgMutationRuntime {
  find(ref: number | string): BurgRef | null;
  rename(i: number, name: string): void;
}

export function findBurgForRenameInPack(
  pack: Pack | undefined,
  ref: number | string,
): BurgRef | null {
  const entry = findEntityByRef(pack?.burgs, ref);
  if (!entry) return null;
  return { i: entry.i, name: entry.name ?? "" };
}

export const defaultBurgMutationRuntime: BurgMutationRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    return { i: entry.i, name: entry.name ?? "" };
  },
  rename(i: number, name: string): void {
    const burgs = getPackCollection<RawBurg>("burgs");
    const b = burgs?.[i];
    if (!b) throw new Error(`Burg ${i} not found.`);
    if (b.removed) throw new Error(`Burg ${i} has been removed.`);
    b.name = name;
    if (typeof document === "undefined") return;
    const label = document.getElementById(`burgLabel${i}`);
    if (label) label.textContent = name;
  },
};

export function createRenameBurgTool(
  runtime: BurgMutationRuntime = defaultBurgMutationRuntime,
): Tool {
  return {
    name: "rename_burg",
    description:
      "Rename a specific burg (city/town). The burg can be identified by numeric id (from list_burgs) or by its current name (case-insensitive). Updates the burg's label on the map automatically.",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description:
            "Numeric burg id (> 0) or the burg's current name (case-insensitive).",
        },
        name: {
          type: "string",
          description: "The new name for the burg.",
        },
      },
      required: ["burg", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { burg?: unknown; name?: unknown };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult("Cannot rename burg 0 (the placeholder entry).");
      }

      const newName = input.name.trim();
      try {
        runtime.rename(current.i, newName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        name: newName,
      });
    },
  };
}

export const renameBurgTool = createRenameBurgTool();
