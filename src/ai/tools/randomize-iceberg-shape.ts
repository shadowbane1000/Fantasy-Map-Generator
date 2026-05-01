import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Minimal shape of an entry in `pack.ice` that this tool needs. The real
 * entries also carry `cellId`, `size`, etc.; we only read `i`, `type`, and
 * the current vertex count.
 */
export interface RandomizeIcebergShapeIceRef {
  i: number;
  type: "glacier" | "iceberg";
  point_count: number;
}

/**
 * Runtime seam for `randomize_iceberg_shape`. Every operation that
 * touches the legacy globals (`pack`, `Ice`, `redrawIceberg`) goes
 * through one of these methods so unit tests can drive the tool without
 * a real browser.
 */
export interface RandomizeIcebergShapeRuntime {
  /**
   * Look up an ice element by id. Returns null when not present. Throws
   * when pack/pack.ice are missing. The returned `point_count` reflects
   * the entry's current `points.length`, so calling `findIce` after the
   * randomize mutation reports the new vertex count.
   */
  findIce(id: number): RandomizeIcebergShapeIceRef | null;
  /** Mirrors window.Ice.randomizeIcebergShape(id). Throws when unavailable. */
  randomizeIcebergShape(id: number): void;
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
  randomizeIcebergShape?: (id: number) => void;
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

export const defaultRandomizeIcebergShapeRuntime: RandomizeIcebergShapeRuntime =
  {
    findIce(id) {
      const ice = getIceArrayFromPack();
      const entry = ice.find((element) => element && element.i === id);
      if (!entry) return null;
      const type = entry.type === "glacier" ? "glacier" : "iceberg";
      const point_count = Array.isArray(entry.points) ? entry.points.length : 0;
      return { i: entry.i, type, point_count };
    },
    randomizeIcebergShape(id) {
      const iceModule = getGlobal<IceModuleLike>("Ice");
      if (typeof iceModule?.randomizeIcebergShape !== "function") {
        throw new Error(
          "Ice.randomizeIcebergShape is not available yet; wait for the map to finish loading.",
        );
      }
      iceModule.randomizeIcebergShape(id);
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

export function createRandomizeIcebergShapeTool(
  runtime: RandomizeIcebergShapeRuntime = defaultRandomizeIcebergShapeRuntime,
): Tool {
  return {
    name: "randomize_iceberg_shape",
    description:
      "Re-roll an iceberg's polygon vertices, mirroring the Edit Ice dialog's Randomize button (public/modules/ui/ice-editor.js#randomizeShape). Delegates to Ice.randomizeIcebergShape, which picks a different random grid cell as a polygon template, rescales it by the iceberg's size around its cell center, and replaces iceberg.points in place. Same size, same cell, different shape. Then triggers redrawIceberg(id) so the new polygon shows up on the map. Glaciers cannot be randomized — pass an iceberg id only.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 0,
          description: "Iceberg id (matches pack.ice[*].i, not array index).",
        },
      },
      required: ["id"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { id?: unknown };

      const idResult = validateId(input.id);
      if (!idResult.ok) return errorResult(idResult.error);
      const { id } = idResult;

      let entry: RandomizeIcebergShapeIceRef | null;
      try {
        entry = runtime.findIce(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      if (!entry) {
        return errorResult(`No ice element found with id ${id}.`);
      }
      if (entry.type === "glacier") {
        return errorResult("Glaciers cannot be randomized; only icebergs.");
      }

      try {
        runtime.randomizeIcebergShape(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.redrawIceberg(id);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      // Read the new point_count after the mutation. If the post-mutation
      // lookup throws or returns null (shouldn't happen — randomize doesn't
      // remove the entry), fall back to 0 rather than crashing the tool.
      let pointCount = 0;
      try {
        const after = runtime.findIce(id);
        if (after) pointCount = after.point_count;
      } catch {
        pointCount = 0;
      }

      return okResult({
        id,
        point_count: pointCount,
      });
    },
  };
}

export const randomizeIcebergShapeTool = createRandomizeIcebergShapeTool();
