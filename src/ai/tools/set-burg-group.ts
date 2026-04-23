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

export interface BurgGroupRef {
  i: number;
  name: string;
  previousGroup: string;
}

export interface BurgGroupRuntime {
  find(ref: number | string): BurgGroupRef | null;
  listGroups(): string[];
  apply(ref: BurgGroupRef, group: string): void;
}

interface BurgsModule {
  groups?: Array<{ name?: unknown }>;
  changeGroup?: (burg: RawBurg, group: string) => void;
}

export const defaultBurgGroupRuntime: BurgGroupRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawBurg>("burgs"), ref);
    if (!entry) return null;
    if (entry.i <= 0) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousGroup: entry.group ?? "",
    };
  },
  listGroups() {
    const burgs = getGlobal<BurgsModule>("Burgs");
    const groups = burgs?.groups;
    if (!Array.isArray(groups)) return [];
    const names: string[] = [];
    for (const g of groups) {
      if (g && typeof g.name === "string" && g.name.trim()) {
        names.push(g.name);
      }
    }
    return names;
  },
  apply(ref, group) {
    const burgs = getPackCollection<RawBurg>("burgs");
    const burg = burgs?.[ref.i];
    if (!burg) throw new Error(`Burg ${ref.i} not found.`);
    if (burg.removed) throw new Error(`Burg ${ref.i} has been removed.`);
    const module = getGlobal<BurgsModule>("Burgs");
    if (!module || typeof module.changeGroup !== "function") {
      throw new Error(
        "Burgs.changeGroup is not available yet (Burgs module not loaded).",
      );
    }
    module.changeGroup(burg, group);
  },
};

export function createSetBurgGroupTool(
  runtime: BurgGroupRuntime = defaultBurgGroupRuntime,
): Tool {
  return {
    name: "set_burg_group",
    description:
      "Reassign a burg to a different group (e.g. capital / city / fort / monastery / caravanserai) — same side-effect as the Burg Editor's Group dropdown. Delegates to Burgs.changeGroup which writes burg.group and reparents the #burg{i} and #burgLabel{i} SVG elements under the new group container. Validates the group against the live Burgs.groups list when available; case-insensitive match is canonicalized to the stored casing. Idempotent (noop when the burg is already in the requested group). Rejects burg 0 (placeholder) and removed burgs.",
    input_schema: {
      type: "object",
      properties: {
        burg: {
          type: ["integer", "string"],
          description: "Numeric burg id (> 0) or current name.",
        },
        group: {
          type: "string",
          description:
            "Target group name (case-insensitive). Must match one of the names in Burgs.groups when that list is available.",
        },
      },
      required: ["burg", "group"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        burg?: unknown;
        group?: unknown;
      };

      const refResult = parseEntityRef(input.burg, "burg");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.group !== "string" || !input.group.trim()) {
        return errorResult("group must be a non-empty string.");
      }
      const trimmed = input.group.trim();

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No burg found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const available = runtime.listGroups();
      let canonical = trimmed;
      if (available.length > 0) {
        const needle = trimmed.toLowerCase();
        const match = available.find((n) => n.toLowerCase() === needle);
        if (!match) {
          return errorResult(
            `Unknown burg group: ${JSON.stringify(trimmed)}.`,
            { supported: available },
          );
        }
        canonical = match;
      }

      if (current.previousGroup === canonical) {
        return okResult({
          i: current.i,
          name: current.name,
          group: canonical,
          previousGroup: current.previousGroup,
          noop: true,
        });
      }

      try {
        runtime.apply(current, canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        group: canonical,
        previousGroup: current.previousGroup,
        noop: false,
      });
    },
  };
}

export const setBurgGroupTool = createSetBurgGroupTool();
