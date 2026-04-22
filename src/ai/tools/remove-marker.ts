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
import { findMarkerNoteRef } from "./set-marker-note";

export interface RemoveMarkerRef {
  i: number;
}

export interface MarkerRemovalRuntime {
  find(ref: number | string): RemoveMarkerRef | null;
  remove(i: number): void;
}

interface MutableMarkerPack {
  markers?: RawMarker[];
}

export const defaultMarkerRemovalRuntime: MarkerRemovalRuntime = {
  find(ref) {
    const result = findMarkerNoteRef(
      getPack<MutableMarkerPack>(),
      getNotes<RawNote>(),
      ref,
    );
    if (!result) return null;
    return { i: result.i };
  },
  remove(i: number): void {
    const notes = getNotes<RawNote>();
    if (Array.isArray(notes)) {
      const id = `marker${i}`;
      const noteIdx = notes.findIndex((n) => n && n.id === id);
      if (noteIdx !== -1) notes.splice(noteIdx, 1);
    }
    const markers = getPack<MutableMarkerPack>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const markerIdx = markers.findIndex((m) => m && m.i === i);
    if (markerIdx === -1) {
      throw new Error(`Marker ${i} not found.`);
    }
    markers.splice(markerIdx, 1);
    if (typeof document !== "undefined") {
      document.getElementById(`marker${i}`)?.remove();
    }
  },
};

export function createRemoveMarkerTool(
  runtime: MarkerRemovalRuntime = defaultMarkerRemovalRuntime,
): Tool {
  return {
    name: "remove_marker",
    description:
      "Delete a marker (point of interest) from the map — same side-effect as the trash icon in the Markers Overview. Removes the marker from pack.markers, its note entry from window.notes, and the SVG icon element. Accepts numeric id or current note name (case-insensitive).",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current note name (case-insensitive).",
        },
      },
      required: ["marker"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { marker?: unknown };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.remove(current.i);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ i: current.i });
    },
  };
}

export const removeMarkerTool = createRemoveMarkerTool();
