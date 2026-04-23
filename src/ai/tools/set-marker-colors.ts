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
import { isValidCssColor } from "./set-state-color";

export const DEFAULT_MARKER_FILL = "#ffffff";
export const DEFAULT_MARKER_STROKE = "#000000";

export interface MarkerColorsRef {
  i: number;
  name: string;
  previousFill: string;
  previousStroke: string;
}

export interface MarkerColorsPatch {
  fill?: string;
  stroke?: string;
}

export interface MarkerColorsRuntime {
  find(ref: number | string): MarkerColorsRef | null;
  apply(i: number, colors: MarkerColorsPatch): void;
}

export const defaultMarkerColorsRuntime: MarkerColorsRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousFill: marker?.fill ?? DEFAULT_MARKER_FILL,
      previousStroke: marker?.stroke ?? DEFAULT_MARKER_STROKE,
    };
  },
  apply(i, colors) {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    if (colors.fill !== undefined) {
      (marker as RawMarker).fill = colors.fill;
    }
    if (colors.stroke !== undefined) {
      (marker as RawMarker).stroke = colors.stroke;
    }
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

export function createSetMarkerColorsTool(
  runtime: MarkerColorsRuntime = defaultMarkerColorsRuntime,
): Tool {
  return {
    name: "set_marker_colors",
    description:
      "Change a marker's pin fill and/or stroke colors — same side-effect as the two color inputs in the Markers Editor. At least one of `fill` / `stroke` must be provided. Writes `marker.fill` / `marker.stroke` and best-effort calls drawMarkers(). Defaults (when unset) are `#ffffff` fill and `#000000` stroke. Accepts any valid CSS color (hex, named, rgb, rgba, hsl, hsla, hwb, lab, lch, color). PER-MARKER scope: the UI cascades to same-type markers, but the AI tool scopes narrowly. Idempotent (noop when each provided field already matches its current value).",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        fill: {
          type: "string",
          description:
            "Optional new pin fill color (CSS color). Omit to leave unchanged.",
        },
        stroke: {
          type: "string",
          description:
            "Optional new pin stroke color (CSS color). Omit to leave unchanged.",
        },
      },
      required: ["marker"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        fill?: unknown;
        stroke?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);

      const hasFill = input.fill !== undefined && input.fill !== null;
      const hasStroke = input.stroke !== undefined && input.stroke !== null;
      if (!hasFill && !hasStroke) {
        return errorResult("at least one of fill / stroke is required.");
      }
      if (hasFill && !isValidCssColor(input.fill)) {
        return errorResult("fill must be a valid CSS color string.");
      }
      if (hasStroke && !isValidCssColor(input.stroke)) {
        return errorResult("stroke must be a valid CSS color string.");
      }
      const fill = hasFill ? (input.fill as string).trim() : undefined;
      const stroke = hasStroke ? (input.stroke as string).trim() : undefined;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const fillMatches = fill === undefined || fill === current.previousFill;
      const strokeMatches =
        stroke === undefined || stroke === current.previousStroke;
      if (fillMatches && strokeMatches) {
        return okResult({
          i: current.i,
          name: current.name,
          fill: fill ?? current.previousFill,
          stroke: stroke ?? current.previousStroke,
          previousFill: current.previousFill,
          previousStroke: current.previousStroke,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, { fill, stroke });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        fill: fill ?? current.previousFill,
        stroke: stroke ?? current.previousStroke,
        previousFill: current.previousFill,
        previousStroke: current.previousStroke,
        noop: false,
      });
    },
  };
}

export const setMarkerColorsTool = createSetMarkerColorsTool();
