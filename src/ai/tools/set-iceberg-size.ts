import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Minimal shape of an entry in `pack.ice` that this tool needs. The real
 * entries also carry `points` and `cellId`; we only read `i`, `type`, and
 * `size`.
 */
export interface SetIcebergSizeIceRef {
  i: number;
  type: "glacier" | "iceberg";
  size: number;
}

/**
 * Runtime seam for `set_iceberg_size`. Every operation that touches the
 * legacy globals (`pack`, `Ice`, `redrawIceberg`) goes through one of
 * these methods so unit tests can drive the tool without a real browser.
 */
export interface SetIcebergSizeRuntime {
  /** Look up an ice element by id. Returns null when not present. Throws when pack/pack.ice are missing. */
  findIce(id: number): SetIcebergSizeIceRef | null;
  /** Mirrors window.Ice.changeIcebergSize(id, size). Throws when unavailable. */
  changeIcebergSize(id: number, size: number): void;
  /** Mirrors window.redrawIceberg(id). Throws when unavailable. */
  redrawIceberg(id: number): void;
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
  changeIcebergSize?: (id: number, size: number) => void;
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

export const defaultSetIcebergSizeRuntime: SetIcebergSizeRuntime = {
  findIce(id) {
    const ice = getIceArrayFromPack();
    const entry = ice.find((element) => element && element.i === id);
    if (!entry) return null;
    const type = entry.type === "glacier" ? "glacier" : "iceberg";
    const size = typeof entry.size === "number" ? entry.size : 0;
    return { i: entry.i, type, size };
  },
  changeIcebergSize(id, size) {
    const iceModule = getGlobal<IceModuleLike>("Ice");
    if (typeof iceModule?.changeIcebergSize !== "function") {
      throw new Error(
        "Ice.changeIcebergSize is not available yet; wait for the map to finish loading.",
      );
    }
    iceModule.changeIcebergSize(id, size);
  },
  redrawIceberg(id) {
    const fn = getGlobal<(id: number) => void>("redrawIceberg");
    if (typeof fn !== "function") {
      throw new Error(
        "redrawIceberg is not available yet; wait for the map to finish loading.",
      );
    }
    fn(id);
  },
};

const SIZE_MIN = 0.05;
const SIZE_MAX = 2;
const SIZE_RANGE_MESSAGE = "size must be a finite number in [0.05, 2].";

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

function validateSize(
  value: unknown,
): { ok: true; size: number } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: false, error: "size is required." };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: SIZE_RANGE_MESSAGE };
  }
  if (value < SIZE_MIN || value > SIZE_MAX) {
    return { ok: false, error: SIZE_RANGE_MESSAGE };
  }
  return { ok: true, size: value };
}

export function createSetIcebergSizeTool(
  runtime: SetIcebergSizeRuntime = defaultSetIcebergSizeRuntime,
): Tool {
  return {
    name: "set_iceberg_size",
    description:
      "Resize an iceberg by id, mirroring the Edit Ice dialog's size slider (public/modules/ui/ice-editor.js#changeSize). Delegates to Ice.changeIcebergSize, which rescales the iceberg's polygon points around its cell center, then triggers redrawIceberg(id) so the change shows up on the map. Glaciers cannot be resized — pass an iceberg id only. Size is the new multiplier in [0.05, 2] (matching the slider in src/index.html).",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 0,
          description: "Iceberg id (matches pack.ice[*].i, not array index).",
        },
        size: {
          type: "number",
          minimum: SIZE_MIN,
          maximum: SIZE_MAX,
          description: "New size multiplier. Must be in [0.05, 2].",
        },
      },
      required: ["id", "size"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { id?: unknown; size?: unknown };

      const idResult = validateId(input.id);
      if (!idResult.ok) return errorResult(idResult.error);
      const { id } = idResult;

      const sizeResult = validateSize(input.size);
      if (!sizeResult.ok) return errorResult(sizeResult.error);
      const { size } = sizeResult;

      let entry: SetIcebergSizeIceRef | null;
      try {
        entry = runtime.findIce(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (!entry) {
        return errorResult(`No ice element found with id ${id}.`);
      }
      if (entry.type === "glacier") {
        return errorResult("Glaciers cannot be resized; only icebergs.");
      }

      const oldSize = entry.size;

      try {
        runtime.changeIcebergSize(id, size);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.redrawIceberg(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id,
        old_size: oldSize,
        new_size: size,
      });
    },
  };
}

export const setIcebergSizeTool = createSetIcebergSizeTool();
