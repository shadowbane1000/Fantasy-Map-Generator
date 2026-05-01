import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Minimal shape of an entry in `pack.ice`. Mirrors `IceModule.generate` and
 * `IceModule.addIceberg` in `src/modules/ice.ts`: glaciers always have `i`,
 * `type`, `points`; icebergs additionally carry `cellId` and `size`. The
 * optional `offset` is set when the user drags an ice element in the UI.
 */
export interface ListIceEntry {
  i: number;
  type: "glacier" | "iceberg";
  cellId?: number | null;
  size?: number | null;
  offset?: unknown;
}

export interface ListIceRuntime {
  /**
   * Return the live `pack.ice` array. Throws with a specific message when
   * `pack` or `pack.ice` is missing, so the tool can surface a differentiated
   * error.
   */
  getIceArray(): readonly ListIceEntry[];
}

interface IcePackLike {
  ice?: unknown;
}

export const defaultListIceRuntime: ListIceRuntime = {
  getIceArray() {
    const pack = getPack<IcePackLike>();
    if (!pack) {
      throw new Error("pack is not available.");
    }
    if (!Array.isArray(pack.ice)) {
      throw new Error("pack.ice is not available.");
    }
    return pack.ice as ListIceEntry[];
  },
};

const ALLOWED_TYPES = new Set<"glacier" | "iceberg">(["glacier", "iceberg"]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function hasOffset(value: unknown): boolean {
  return Array.isArray(value);
}

interface ItemSummary {
  id: number;
  type: "glacier" | "iceberg";
  cell_id: number | null;
  size: number | null;
  has_offset: boolean;
}

function summarize(entry: ListIceEntry): ItemSummary {
  const type = entry.type === "glacier" ? "glacier" : "iceberg";
  return {
    id: entry.i,
    type,
    cell_id: isFiniteNumber(entry.cellId) ? entry.cellId : null,
    size: isFiniteNumber(entry.size) ? entry.size : null,
    has_offset: hasOffset(entry.offset),
  };
}

export function createListIceTool(
  runtime: ListIceRuntime = defaultListIceRuntime,
): Tool {
  return {
    name: "list_ice",
    description:
      "List the ice elements (glaciers and icebergs) in pack.ice — there is no single dropdown for this in the UI, so this is how the AI discovers what ice exists for use with add_iceberg, remove_ice, and set_iceberg_size. Each entry reports id (matches pack.ice[*].i, not array index), type ('glacier' or 'iceberg'), cell_id (icebergs only; glaciers report null since IceModule.generate doesn't set one), size (iceberg multiplier; null for glaciers), and has_offset (true iff the user dragged the element so an offset is set). Entries are returned in pack.ice order. Optional type filter ('glacier' | 'iceberg'); omitted = both. Returns { count, total, items }, where total is the unfiltered pack.ice length.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["glacier", "iceberg"],
          description:
            "Optional filter: only return glaciers or only icebergs. Omit to return both.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown };

      let typeFilter: "glacier" | "iceberg" | null = null;
      if (input.type !== undefined && input.type !== null) {
        if (
          typeof input.type !== "string" ||
          !ALLOWED_TYPES.has(input.type as "glacier" | "iceberg")
        ) {
          return errorResult("type must be 'glacier' or 'iceberg'.");
        }
        typeFilter = input.type as "glacier" | "iceberg";
      }

      let ice: readonly ListIceEntry[];
      try {
        ice = runtime.getIceArray();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const total = ice.length;
      const filtered =
        typeFilter === null
          ? ice
          : ice.filter((entry) => entry && entry.type === typeFilter);
      const items = filtered.map(summarize);

      return okResult({
        count: items.length,
        total,
        items,
      });
    },
  };
}

export const listIceTool = createListIceTool();
