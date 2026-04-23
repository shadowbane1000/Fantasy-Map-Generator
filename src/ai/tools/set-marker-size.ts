import {
  errorResult,
  getGlobal,
  getNotes,
  getPack,
  okResult,
  parseEntityRef,
  type RawMarker,
  type RawNote,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findMarkerNoteRef, type MarkerNotePackLike } from "./set-marker-note";

export const DEFAULT_MARKER_SIZE = 30;

export interface MarkerSizeRef {
  i: number;
  name: string;
  previousSize: number;
}

export interface MarkerSizeRuntime {
  find(ref: number | string): MarkerSizeRef | null;
  setSize(i: number, size: number): void;
}

export const defaultMarkerSizeRuntime: MarkerSizeRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousSize: marker?.size ?? DEFAULT_MARKER_SIZE,
    };
  },
  setSize(i, size) {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    (marker as RawMarker).size = size;
    const draw = getGlobal<() => void>("drawMarkers");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort.
      }
    }
  },
};

export function createSetMarkerSizeTool(
  runtime: MarkerSizeRuntime = defaultMarkerSizeRuntime,
): Tool {
  return {
    name: "set_marker_size",
    description: `Change a marker's size — mirrors the Size input in the Markers Editor. Writes \`marker.size\` (default is ${DEFAULT_MARKER_SIZE} if unset) and best-effort calls drawMarkers() to refresh. PER-MARKER scope: unlike the UI (which cascades to every same-type marker via getSameTypeMarkers), this tool only updates the target marker — the AI can iterate for bulk behavior. Idempotent (noop when already at target). Matches by id or case-insensitive current note name. Size must be a finite number > 0.`,
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        size: {
          type: "number",
          description:
            "New marker size (finite number > 0). Default unset value is 30.",
        },
      },
      required: ["marker", "size"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        size?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);

      if (
        typeof input.size !== "number" ||
        !Number.isFinite(input.size) ||
        input.size <= 0
      ) {
        return errorResult("size must be a finite number > 0.");
      }
      const size = input.size;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousSize === size) {
        return okResult({
          i: current.i,
          name: current.name,
          size,
          previousSize: current.previousSize,
          noop: true,
        });
      }

      try {
        runtime.setSize(current.i, size);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        size,
        previousSize: current.previousSize,
        noop: false,
      });
    },
  };
}

export const setMarkerSizeTool = createSetMarkerSizeTool();
