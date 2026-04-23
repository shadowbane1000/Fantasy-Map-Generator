import {
  errorResult,
  getNotes,
  getPack,
  okResult,
  parseEntityRef,
  type RawMarker,
  type RawNote,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findMarkerNoteRef, type MarkerNotePackLike } from "./set-marker-note";

export interface MarkerTypeRef {
  i: number;
  name: string;
  previousType: string;
}

export interface MarkerTypeRuntime {
  find(ref: number | string): MarkerTypeRef | null;
  setType(i: number, type: string): void;
}

export const defaultMarkerTypeRuntime: MarkerTypeRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousType: marker?.type ?? "",
    };
  },
  setType(i: number, type: string): void {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    (marker as RawMarker).type = type;
  },
};

export function createSetMarkerTypeTool(
  runtime: MarkerTypeRuntime = defaultMarkerTypeRuntime,
): Tool {
  return {
    name: "set_marker_type",
    description:
      "Change a marker's type (a free-form label grouping related markers — shown in the Markers Editor's 'Type' input). Writes marker.type directly; no redraw is triggered because type is metadata and does not affect the rendered icon. Idempotent: a noop is returned when the marker already has this type. Accepts either a numeric marker id or the marker's case-insensitive note name.",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        type: {
          type: "string",
          description:
            "New type label. Required, non-empty after trimming. Arbitrary free-form string (e.g. 'volcano', 'ruin', 'lair').",
        },
      },
      required: ["marker", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        type?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.type !== "string") {
        return errorResult("type must be a non-empty string.");
      }
      const trimmed = input.type.trim();
      if (!trimmed) {
        return errorResult("type must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousType === trimmed) {
        return okResult({
          i: current.i,
          name: current.name,
          type: trimmed,
          previousType: current.previousType,
          noop: true,
        });
      }

      try {
        runtime.setType(current.i, trimmed);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        type: trimmed,
        previousType: current.previousType,
        noop: false,
      });
    },
  };
}

export const setMarkerTypeTool = createSetMarkerTypeTool();
