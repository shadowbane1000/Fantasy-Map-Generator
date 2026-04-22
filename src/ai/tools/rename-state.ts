import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface StateRef {
  i: number;
  name: string;
  fullName: string | null;
}

export interface StateMutationRuntime {
  find(ref: number | string): StateRef | null;
  rename(i: number, name: string, fullName?: string): void;
}

export const defaultStateMutationRuntime: StateMutationRuntime = {
  find(ref: number | string): StateRef | null {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      fullName: entry.fullName ?? null,
    };
  },
  rename(i: number, name: string, fullName?: string): void {
    const states = getPackCollection<RawState>("states");
    const s = states?.[i];
    if (!s) throw new Error(`State ${i} not found.`);
    if (s.removed) throw new Error(`State ${i} has been removed.`);
    s.name = name;
    if (fullName !== undefined) s.fullName = fullName;
    const draw = getGlobal<(ids: number[]) => void>("drawStateLabels");
    if (typeof draw === "function") draw([i]);
  },
};

export function createRenameStateTool(
  runtime: StateMutationRuntime = defaultStateMutationRuntime,
): Tool {
  return {
    name: "rename_state",
    description:
      "Rename a specific state. The state can be identified by numeric id (from get_map_info/list_states) or by its current name (case-insensitive). Updates the state's label on the map automatically.",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description: "Numeric state id (> 0) or the state's current name.",
        },
        name: {
          type: "string",
          description: "The new short name for the state.",
        },
        fullName: {
          type: "string",
          description:
            "Optional new full/ceremonial name (e.g. 'The Kingdom of Valorin').",
        },
      },
      required: ["state", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        name?: unknown;
        fullName?: unknown;
      };

      if (
        typeof input.state === "number" &&
        Number.isInteger(input.state) &&
        input.state <= 0
      ) {
        return errorResult("Cannot rename state 0 (the Neutrals placeholder).");
      }
      const refResult = parseEntityRef(input.state, "state");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      if (
        input.fullName !== undefined &&
        input.fullName !== null &&
        (typeof input.fullName !== "string" || !input.fullName.trim())
      ) {
        return errorResult(
          "fullName, if provided, must be a non-empty string.",
        );
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i === 0) {
        return errorResult("Cannot rename state 0 (the Neutrals placeholder).");
      }

      const newName = input.name.trim();
      const newFullName =
        typeof input.fullName === "string" ? input.fullName.trim() : undefined;

      try {
        runtime.rename(current.i, newName, newFullName);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.name,
        previousFullName: current.fullName,
        name: newName,
        fullName: newFullName ?? current.fullName,
      });
    },
  };
}

export const renameStateTool = createRenameStateTool();
