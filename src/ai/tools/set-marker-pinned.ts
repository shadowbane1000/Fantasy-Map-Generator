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

export interface MarkerPinnedRef {
  i: number;
  name: string;
  previousPinned: boolean;
}

export interface MarkerPinnedRuntime {
  find(ref: number | string): MarkerPinnedRef | null;
  setPinned(i: number, pinned: boolean): void;
}

export const defaultMarkerPinnedRuntime: MarkerPinnedRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousPinned: !!marker?.pinned,
    };
  },
  setPinned(i: number, pinned: boolean): void {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    if (pinned) (marker as RawMarker).pinned = true;
    else delete (marker as RawMarker).pinned;
    const anyPinned = markers.some((m) => m?.pinned);
    if (typeof document !== "undefined") {
      const group = document.getElementById("markers");
      if (group) {
        if (anyPinned) group.setAttribute("pinned", "1");
        else group.removeAttribute("pinned");
      }
    }
    const draw = getGlobal<() => void>("drawMarkers");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: the mutation already happened.
      }
    }
  },
};

export function createSetMarkerPinnedTool(
  runtime: MarkerPinnedRuntime = defaultMarkerPinnedRuntime,
): Tool {
  return {
    name: "set_marker_pinned",
    description:
      'Pin or unpin a marker (point of interest) — same side-effect as the pin icon in the Markers Overview. Writes marker.pinned, keeps the #markers SVG group\'s pinned attribute in sync (set to "1" when any marker is pinned, removed otherwise), and calls drawMarkers() to refresh. Idempotent: a noop is returned when the marker is already in the requested state. Markers match by numeric id or case-insensitive current note name.',
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        pinned: {
          type: "boolean",
          description: "true to pin the marker, false to unpin it.",
        },
      },
      required: ["marker", "pinned"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        pinned?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.pinned !== "boolean") {
        return errorResult("pinned must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousPinned === input.pinned) {
        return okResult({
          i: current.i,
          name: current.name,
          pinned: input.pinned,
          previousPinned: current.previousPinned,
          noop: true,
        });
      }

      try {
        runtime.setPinned(current.i, input.pinned);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        pinned: input.pinned,
        previousPinned: current.previousPinned,
        noop: false,
      });
    },
  };
}

export const setMarkerPinnedTool = createSetMarkerPinnedTool();
