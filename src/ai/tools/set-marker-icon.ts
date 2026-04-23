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

export interface MarkerIconRef {
  i: number;
  name: string;
  previousIcon: string;
}

export interface MarkerIconRuntime {
  find(ref: number | string): MarkerIconRef | null;
  setIcon(i: number, icon: string): void;
}

export const defaultMarkerIconRuntime: MarkerIconRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousIcon: marker?.icon ?? "",
    };
  },
  setIcon(i, icon) {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    (marker as RawMarker).icon = icon;
    const draw = getGlobal<() => void>("drawMarkers");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: data mutation already landed.
      }
    }
  },
};

export function createSetMarkerIconTool(
  runtime: MarkerIconRuntime = defaultMarkerIconRuntime,
): Tool {
  return {
    name: "set_marker_icon",
    description:
      "Change a marker's icon — mirrors the Markers Editor's icon picker. `icon` is the raw glyph string (emoji like '🌋' or 'http(s)://' / 'data:image/...' URL). Writes marker.icon and best-effort calls drawMarkers() to refresh the rendered icon. PER-MARKER scope: unlike the UI's icon picker (which propagates to every marker with the same type via getSameTypeMarkers), this tool only updates the target marker. The AI can iterate if bulk behavior is wanted. Idempotent: noop when already at target.",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        icon: {
          type: "string",
          description:
            "New icon string. Non-empty after trimming. Typically a single emoji but can be any short string or a URL.",
        },
      },
      required: ["marker", "icon"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        icon?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.icon !== "string") {
        return errorResult("icon must be a non-empty string.");
      }
      const trimmed = input.icon.trim();
      if (!trimmed) {
        return errorResult("icon must be a non-empty string.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousIcon === trimmed) {
        return okResult({
          i: current.i,
          name: current.name,
          icon: trimmed,
          previousIcon: current.previousIcon,
          noop: true,
        });
      }

      try {
        runtime.setIcon(current.i, trimmed);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        icon: trimmed,
        previousIcon: current.previousIcon,
        noop: false,
      });
    },
  };
}

export const setMarkerIconTool = createSetMarkerIconTool();
