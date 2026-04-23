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

export const DEFAULT_MARKER_ICON_SIZE = 12;
export const MARKER_ICON_SIZE_MIN = 2;
export const MARKER_ICON_SIZE_MAX = 20;

export interface MarkerIconSizeRef {
  i: number;
  name: string;
  previousPx: number;
}

export interface SetMarkerIconSizeRuntime {
  find(ref: number | string): MarkerIconSizeRef | null;
  apply(i: number, px: number): void;
}

export const defaultSetMarkerIconSizeRuntime: SetMarkerIconSizeRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousPx: marker?.px ?? DEFAULT_MARKER_ICON_SIZE,
    };
  },
  apply(i, px) {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    (marker as RawMarker).px = px;
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

export function createSetMarkerIconSizeTool(
  runtime: SetMarkerIconSizeRuntime = defaultSetMarkerIconSizeRuntime,
): Tool {
  return {
    name: "set_marker_icon_size",
    description: `Change a marker's icon size — the second "Icon size" number input in the Markers Editor. Writes \`marker.px\` (the pixel size of the emoji/glyph inside the pin; default is ${DEFAULT_MARKER_ICON_SIZE} if unset) and best-effort calls drawMarkers() to refresh. Distinct from set_marker_size, which changes the PIN size (marker.size). PER-MARKER scope: unlike the UI (which cascades to every same-type marker via getSameTypeMarkers), this tool only updates the target marker — the AI can iterate for bulk behavior. Idempotent (noop when already at target). Matches by id or case-insensitive current note name. Size must be a finite number in [${MARKER_ICON_SIZE_MIN}, ${MARKER_ICON_SIZE_MAX}].`,
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
          description: `New icon size in pixels (finite number in [${MARKER_ICON_SIZE_MIN}, ${MARKER_ICON_SIZE_MAX}]). Default unset value is ${DEFAULT_MARKER_ICON_SIZE}.`,
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

      if (typeof input.size !== "number" || !Number.isFinite(input.size)) {
        return errorResult("size must be a finite number.");
      }
      if (
        input.size < MARKER_ICON_SIZE_MIN ||
        input.size > MARKER_ICON_SIZE_MAX
      ) {
        return errorResult(
          `size must be between ${MARKER_ICON_SIZE_MIN} and ${MARKER_ICON_SIZE_MAX}.`,
        );
      }
      const px = input.size;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousPx === px) {
        return okResult({
          i: current.i,
          name: current.name,
          px,
          previousPx: current.previousPx,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, px);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        px,
        previousPx: current.previousPx,
        noop: false,
      });
    },
  };
}

export const setMarkerIconSizeTool = createSetMarkerIconSizeTool();
