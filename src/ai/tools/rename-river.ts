import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RiverRenameRef {
  i: number;
  name: string;
}

export interface RiverRenameRuntime {
  find(ref: number | string): RiverRenameRef | null;
  rename(i: number, name: string): void;
}

interface RiverPackLike {
  rivers?: RawRiver[];
}

export function findRiverByRef(
  rivers: RawRiver[] | undefined,
  ref: number | string,
): RawRiver | null {
  if (!Array.isArray(rivers)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return null;
    for (const r of rivers) {
      if (r && !r.removed && r.i === ref) return r;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const r of rivers) {
    if (!r || r.removed) continue;
    if ((r.name ?? "").toLowerCase() === needle) return r;
  }
  return null;
}

export const defaultRiverRenameRuntime: RiverRenameRuntime = {
  find(ref) {
    const river = findRiverByRef(getPack<RiverPackLike>()?.rivers, ref);
    if (!river) return null;
    return { i: river.i, name: river.name ?? "" };
  },
  rename(i: number, name: string): void {
    const river = findRiverByRef(getPack<RiverPackLike>()?.rivers, i);
    if (!river) throw new Error(`River ${i} not found.`);
    river.name = name;
  },
};

export function createRenameRiverTool(
  runtime: RiverRenameRuntime = defaultRiverRenameRuntime,
): Tool {
  return {
    name: "rename_river",
    description:
      "Rename a river. Writes pack.rivers[k].name — same side-effect as typing a new name into the Rivers Editor. Rivers match by numeric river.i (non-contiguous ids — generator skips removed rivers) or case-insensitive current name. Doesn't regenerate the culture-based name; pass the exact new name.",
    input_schema: {
      type: "object",
      properties: {
        river: {
          type: ["integer", "string"],
          description:
            "Numeric river id (matches river.i, not array index) or the river's current case-insensitive name.",
        },
        name: {
          type: "string",
          description: "The new name for the river.",
        },
      },
      required: ["river", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        river?: unknown;
        name?: unknown;
      };

      const refResult = parseEntityRef(input.river, "river");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No river found matching ${JSON.stringify(refResult.ref)}.`,
        );
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

export const renameRiverTool = createRenameRiverTool();
