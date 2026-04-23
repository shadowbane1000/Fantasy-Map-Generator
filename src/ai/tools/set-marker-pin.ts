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

export const MARKER_PIN_SHAPES = [
  "bubble",
  "pin",
  "square",
  "squarish",
  "diamond",
  "hex",
  "hexy",
  "shieldy",
  "shield",
  "pentagon",
  "heptagon",
  "circle",
  "no",
] as const;

export type MarkerPin = (typeof MARKER_PIN_SHAPES)[number];

export const DEFAULT_MARKER_PIN: MarkerPin = "bubble";

const LOOKUP = new Map<string, MarkerPin>();
for (const s of MARKER_PIN_SHAPES) LOOKUP.set(s.toLowerCase(), s);

export function resolveMarkerPin(value: unknown): MarkerPin | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface MarkerPinRef {
  i: number;
  name: string;
  previousPin: string;
}

export interface MarkerPinRuntime {
  find(ref: number | string): MarkerPinRef | null;
  setPin(i: number, pin: MarkerPin): void;
}

export const defaultMarkerPinRuntime: MarkerPinRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousPin: marker?.pin ?? DEFAULT_MARKER_PIN,
    };
  },
  setPin(i, pin) {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    (marker as RawMarker).pin = pin;
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

export function createSetMarkerPinTool(
  runtime: MarkerPinRuntime = defaultMarkerPinRuntime,
): Tool {
  return {
    name: "set_marker_pin",
    description: `Change a marker's pin shape — same side-effect as the Pin Shape dropdown in the Markers Editor. Writes \`marker.pin\` (default is "${DEFAULT_MARKER_PIN}" when unset). One of: ${MARKER_PIN_SHAPES.join(", ")} (case-insensitive). Best-effort calls drawMarkers(). PER-MARKER scope: the UI cascades to every same-type marker, but the AI tool scopes narrowly for predictable control. Idempotent (noop when already at target).`,
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        pin: {
          type: "string",
          enum: [...MARKER_PIN_SHAPES],
          description: `Pin shape. One of: ${MARKER_PIN_SHAPES.join(", ")} (case-insensitive).`,
        },
      },
      required: ["marker", "pin"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        pin?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.pin !== "string" || !input.pin.trim()) {
        return errorResult("pin must be a non-empty string.", {
          supported: [...MARKER_PIN_SHAPES],
        });
      }
      const canonical = resolveMarkerPin(input.pin);
      if (!canonical) {
        return errorResult(
          `Unknown marker pin shape: ${JSON.stringify(input.pin)}.`,
          { supported: [...MARKER_PIN_SHAPES] },
        );
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousPin === canonical) {
        return okResult({
          i: current.i,
          name: current.name,
          pin: canonical,
          previousPin: current.previousPin,
          noop: true,
        });
      }

      try {
        runtime.setPin(current.i, canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        pin: canonical,
        previousPin: current.previousPin,
        noop: false,
      });
    },
  };
}

export const setMarkerPinTool = createSetMarkerPinTool();
