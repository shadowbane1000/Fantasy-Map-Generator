import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRiverByRef } from "./rename-river";

export interface RiverParentRef {
  i: number;
  name: string;
  removed: boolean;
  previousParent: number;
  previousBasin: number;
}

export interface ParentResolution {
  basin: number;
}

export type ResolveParentResult =
  | "not-ready"
  | "not-found"
  | "removed"
  | ParentResolution;

export interface RiverParentRuntime {
  find(ref: number | string): RiverParentRef | null;
  resolveParent(parentId: number): ResolveParentResult;
  apply(i: number, parent: number, basin: number): void;
}

interface RiverPackLike {
  rivers?: RawRiver[];
}

function findRiverIncludingRemoved(
  rivers: RawRiver[] | undefined,
  ref: number | string,
): RawRiver | null {
  if (!Array.isArray(rivers)) return null;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref)) return null;
    for (const r of rivers) {
      if (r && r.i === ref) return r;
    }
    return null;
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const r of rivers) {
    if (!r) continue;
    if ((r.name ?? "").toLowerCase() === needle) return r;
  }
  return null;
}

export const defaultRiverParentRuntime: RiverParentRuntime = {
  find(ref) {
    const rivers = getPack<RiverPackLike>()?.rivers;
    const river = findRiverIncludingRemoved(rivers, ref);
    if (!river) return null;
    return {
      i: river.i,
      name: river.name ?? "",
      removed: river.removed === true,
      previousParent: typeof river.parent === "number" ? river.parent : 0,
      previousBasin: typeof river.basin === "number" ? river.basin : river.i,
    };
  },
  resolveParent(parentId) {
    const rivers = getPack<RiverPackLike>()?.rivers;
    if (!Array.isArray(rivers)) return "not-ready";
    let entry: RawRiver | null = null;
    for (const r of rivers) {
      if (r && r.i === parentId) {
        entry = r;
        break;
      }
    }
    if (!entry) return "not-found";
    if (entry.removed === true) return "removed";
    return {
      basin: typeof entry.basin === "number" ? entry.basin : entry.i,
    };
  },
  apply(i, parent, basin) {
    const rivers = getPack<RiverPackLike>()?.rivers;
    if (!Array.isArray(rivers)) {
      throw new Error(
        "window.pack.rivers is not available; the map hasn't finished loading.",
      );
    }
    const river = findRiverByRef(rivers, i);
    if (!river) throw new Error(`River ${i} not found.`);
    river.parent = parent;
    river.basin = basin;
  },
};

export function createSetRiverParentTool(
  runtime: RiverParentRuntime = defaultRiverParentRuntime,
): Tool {
  return {
    name: "set_river_parent",
    description:
      "Set a river's parent (which other river it flows into) and update its basin to the parent's basin — same side-effect as the Rivers Editor's Parent select. Writes pack.rivers[k].parent and pack.rivers[k].basin. The basin propagates from the parent's basin field, NOT from the parent's id, so downstream watershed lookups (find_rivers_by_basin) stay consistent. Special case: parent=0 means 'no parent / this river is a trunk'; basin is set to the river's own id. Cannot set a river as its own parent. Rivers match by numeric river.i (non-contiguous ids — generator skips removed rivers) or case-insensitive current name; removed rivers are rejected. Data-only: doesn't redraw the river layer (parent/basin don't drive SVG geometry).",
    input_schema: {
      type: "object",
      properties: {
        river: {
          type: ["integer", "string"],
          description:
            "Numeric river id (matches river.i, not array index — ids are non-contiguous because the generator skips removed rivers) or current case-insensitive name.",
        },
        parent: {
          type: "integer",
          minimum: 0,
          description:
            "Parent river id (0 means no parent / this river is a trunk; basin will be set to the river's own id).",
        },
      },
      required: ["river", "parent"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        river?: unknown;
        parent?: unknown;
      };

      const refResult = parseEntityRef(input.river, "river");
      if (!refResult.ok) return errorResult(refResult.error);

      if (
        typeof input.parent !== "number" ||
        !Number.isInteger(input.parent) ||
        input.parent < 0
      ) {
        return errorResult("parent must be a non-negative integer.");
      }
      const parent = input.parent;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(`River ${JSON.stringify(refResult.ref)} not found.`);
      }
      if (current.removed) {
        return errorResult(`Cannot set parent on removed river ${current.i}.`);
      }

      let basin: number;
      if (parent === 0) {
        basin = current.i;
      } else {
        if (parent === current.i) {
          return errorResult("Cannot set parent to the river itself.");
        }
        const resolution = runtime.resolveParent(parent);
        if (resolution === "not-ready") {
          return errorResult(
            "window.pack.rivers is not available; the map hasn't finished loading.",
          );
        }
        if (resolution === "not-found") {
          return errorResult(`Parent river ${parent} not found.`);
        }
        if (resolution === "removed") {
          return errorResult(`Parent river ${parent} is removed.`);
        }
        basin = resolution.basin;
      }

      try {
        runtime.apply(current.i, parent, basin);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        river: { i: current.i, name: current.name },
        previous_parent: current.previousParent,
        previous_basin: current.previousBasin,
        parent,
        basin,
      });
    },
  };
}

export const setRiverParentTool = createSetRiverParentTool();
