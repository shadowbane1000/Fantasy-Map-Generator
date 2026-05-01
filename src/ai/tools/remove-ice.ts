import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RemoveIceRef {
  i: number;
  type: "glacier" | "iceberg";
  cellId: number | null;
}

export interface RemoveIceRuntime {
  findIce(id: number): RemoveIceRef | null;
  removeIce(id: number): void;
  getIceArray(): readonly { i: number }[] | null;
}

interface RawIceElement {
  i: number;
  type?: "glacier" | "iceberg";
  cellId?: number;
  size?: number;
  points?: unknown;
}

interface IcePackLike {
  ice?: RawIceElement[];
}

interface IceModuleLike {
  removeIce?: (id: number) => void;
}

function getIceArrayFromPack(): RawIceElement[] {
  const pack = getPack<IcePackLike>();
  if (!pack) {
    throw new Error("pack is not available.");
  }
  const ice = pack.ice;
  if (!Array.isArray(ice)) {
    throw new Error("pack.ice is not available.");
  }
  return ice;
}

export const defaultRemoveIceRuntime: RemoveIceRuntime = {
  findIce(id) {
    const ice = getIceArrayFromPack();
    const entry = ice.find((element) => element && element.i === id);
    if (!entry) return null;
    const type = entry.type === "glacier" ? "glacier" : "iceberg";
    return {
      i: entry.i,
      type,
      cellId: typeof entry.cellId === "number" ? entry.cellId : null,
    };
  },
  removeIce(id) {
    const iceModule = getGlobal<IceModuleLike>("Ice");
    if (typeof iceModule?.removeIce !== "function") {
      throw new Error(
        "Ice.removeIce is not available yet; wait for the map to finish loading.",
      );
    }
    iceModule.removeIce(id);
  },
  getIceArray() {
    const pack = getPack<IcePackLike>();
    const ice = pack?.ice;
    return Array.isArray(ice) ? ice : null;
  },
};

function validateId(
  value: unknown,
): { ok: true; id: number } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: false, error: "id is required." };
  }
  if (typeof value !== "number") {
    return { ok: false, error: "id must be a non-negative integer." };
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return { ok: false, error: "id must be a non-negative integer." };
  }
  return { ok: true, id: value };
}

export function createRemoveIceTool(
  runtime: RemoveIceRuntime = defaultRemoveIceRuntime,
): Tool {
  return {
    name: "remove_ice",
    description:
      "Delete an ice element (glacier or iceberg) by id — same side-effect as the Edit Ice dialog's Remove button. Delegates to Ice.removeIce(), which splices the entry from pack.ice and redraws the matching ice polygon (so it disappears from the map). The UI's confirm dialog is skipped since tools run non-interactively.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description:
            "Ice element id (matches pack.ice[*].i, not array index). Ids start at 0.",
        },
      },
      required: ["id"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { id?: unknown };

      const idResult = validateId(input.id);
      if (!idResult.ok) return errorResult(idResult.error);
      const { id } = idResult;

      let current: RemoveIceRef | null;
      try {
        current = runtime.findIce(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (!current) {
        return errorResult(`No ice element found with id ${id}.`);
      }

      try {
        runtime.removeIce(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let postIce: readonly { i: number }[] | null;
      try {
        postIce = runtime.getIceArray();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (
        Array.isArray(postIce) &&
        postIce.some((entry) => entry && entry.i === id)
      ) {
        return errorResult(
          `Failed to remove ice element ${id}: still present in pack.ice.`,
        );
      }

      return okResult({
        id: current.i,
        type: current.type,
        cell_id: current.cellId,
      });
    },
  };
}

export const removeIceTool = createRemoveIceTool();
