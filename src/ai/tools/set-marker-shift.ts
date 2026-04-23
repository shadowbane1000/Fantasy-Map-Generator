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

export const DEFAULT_MARKER_SHIFT = 50;
export const MARKER_SHIFT_MIN = 0;
export const MARKER_SHIFT_MAX = 100;

export interface MarkerShiftRef {
  i: number;
  name: string;
  previousDx: number;
  previousDy: number;
}

export interface SetMarkerShiftRuntime {
  find(ref: number | string): MarkerShiftRef | null;
  apply(i: number, dx: number, dy: number): void;
}

export const defaultSetMarkerShiftRuntime: SetMarkerShiftRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousDx: marker?.dx ?? DEFAULT_MARKER_SHIFT,
      previousDy: marker?.dy ?? DEFAULT_MARKER_SHIFT,
    };
  },
  apply(i, dx, dy) {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    (marker as RawMarker).dx = dx;
    (marker as RawMarker).dy = dy;
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

function validateShift(
  value: unknown,
  field: "dx" | "dy",
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${field} must be a finite number.` };
  }
  if (value < MARKER_SHIFT_MIN || value > MARKER_SHIFT_MAX) {
    return {
      ok: false,
      error: `${field} must be between ${MARKER_SHIFT_MIN} and ${MARKER_SHIFT_MAX}.`,
    };
  }
  return { ok: true, value };
}

export function createSetMarkerShiftTool(
  runtime: SetMarkerShiftRuntime = defaultSetMarkerShiftRuntime,
): Tool {
  return {
    name: "set_marker_shift",
    description: `Change a marker's icon horizontal/vertical shift inside the pin — mirrors the "Icon dx" / "Icon dy" number inputs in the Markers Editor. Writes \`marker.dx\` and/or \`marker.dy\` (percentage offsets of the icon within the pin; default is ${DEFAULT_MARKER_SHIFT} if unset) and best-effort calls drawMarkers() to refresh. Distinct from move_marker (marker.x/y = map position) and set_marker_icon_size (marker.px = icon pixel size). At least one of \`dx\` / \`dy\` is required; the other field is preserved. PER-MARKER scope: unlike the UI (which cascades to every same-type marker via getSameTypeMarkers), this tool only updates the target marker — the AI can iterate for bulk behavior. Idempotent (noop when both dx and dy already match). Matches by id or case-insensitive current note name. Values must be finite numbers in [${MARKER_SHIFT_MIN}, ${MARKER_SHIFT_MAX}].`,
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        dx: {
          type: "number",
          description: `New horizontal icon shift (percentage in [${MARKER_SHIFT_MIN}, ${MARKER_SHIFT_MAX}]). Optional — omit to keep the current dx. Default unset value is ${DEFAULT_MARKER_SHIFT}.`,
        },
        dy: {
          type: "number",
          description: `New vertical icon shift (percentage in [${MARKER_SHIFT_MIN}, ${MARKER_SHIFT_MAX}]). Optional — omit to keep the current dy. Default unset value is ${DEFAULT_MARKER_SHIFT}.`,
        },
      },
      required: ["marker"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        dx?: unknown;
        dy?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);

      const hasDx = input.dx !== undefined;
      const hasDy = input.dy !== undefined;
      if (!hasDx && !hasDy) {
        return errorResult("At least one of dx / dy must be provided.");
      }

      let dx: number | undefined;
      let dy: number | undefined;
      if (hasDx) {
        const v = validateShift(input.dx, "dx");
        if (!v.ok) return errorResult(v.error);
        dx = v.value;
      }
      if (hasDy) {
        const v = validateShift(input.dy, "dy");
        if (!v.ok) return errorResult(v.error);
        dy = v.value;
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const nextDx = dx ?? current.previousDx;
      const nextDy = dy ?? current.previousDy;

      if (current.previousDx === nextDx && current.previousDy === nextDy) {
        return okResult({
          i: current.i,
          name: current.name,
          dx: nextDx,
          dy: nextDy,
          previousDx: current.previousDx,
          previousDy: current.previousDy,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, nextDx, nextDy);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        dx: nextDx,
        dy: nextDy,
        previousDx: current.previousDx,
        previousDy: current.previousDy,
        noop: false,
      });
    },
  };
}

export const setMarkerShiftTool = createSetMarkerShiftTool();
