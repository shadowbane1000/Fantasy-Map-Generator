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

export interface MoveMarkerRef {
  i: number;
  name: string;
  previousX: number;
  previousY: number;
  previousCell: number;
}

export interface MoveMarkerRuntime {
  find(ref: number | string): MoveMarkerRef | null;
  move(ref: MoveMarkerRef, x: number, y: number): number;
}

export const defaultMoveMarkerRuntime: MoveMarkerRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m && m.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousX: marker?.x ?? 0,
      previousY: marker?.y ?? 0,
      previousCell: marker?.cell ?? 0,
    };
  },
  move(ref, x, y) {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m && m.i === ref.i);
    if (!marker) throw new Error(`Marker ${ref.i} not found.`);
    const findCell = getGlobal<(x: number, y: number) => number>("findCell");
    if (typeof findCell !== "function") {
      throw new Error(
        "findCell is not available yet; the map hasn't finished loading.",
      );
    }
    const cell = findCell(x, y);
    (marker as RawMarker).x = x;
    (marker as RawMarker).y = y;
    (marker as RawMarker).cell = cell;

    if (typeof document !== "undefined") {
      const node = document.getElementById(`marker${ref.i}`);
      if (node) {
        node.setAttribute("x", String(x));
        node.setAttribute("y", String(y));
      }
    }
    const draw = getGlobal<() => void>("drawMarkers");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort.
      }
    }
    return cell;
  },
};

export function createMoveMarkerTool(
  runtime: MoveMarkerRuntime = defaultMoveMarkerRuntime,
): Tool {
  return {
    name: "move_marker",
    description:
      "Relocate a marker on the map — same side-effect as dragging the marker in the Markers Editor. Writes `marker.x`, `marker.y`, and `marker.cell = findCell(x, y)`. Best-effort updates the `#marker{i}` SVG x/y attributes and calls `drawMarkers()` as a fallback. Idempotent (noop when the coordinates already match). Accepts a marker by numeric id or case-insensitive note name.",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        x: {
          type: "number",
          description: "New x coordinate (finite number).",
        },
        y: {
          type: "number",
          description: "New y coordinate (finite number).",
        },
      },
      required: ["marker", "x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        x?: unknown;
        y?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);

      if (typeof input.x !== "number" || !Number.isFinite(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (typeof input.y !== "number" || !Number.isFinite(input.y)) {
        return errorResult("y must be a finite number.");
      }
      const x = input.x;
      const y = input.y;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousX === x && current.previousY === y) {
        return okResult({
          i: current.i,
          name: current.name,
          x,
          y,
          cell: current.previousCell,
          previousX: current.previousX,
          previousY: current.previousY,
          previousCell: current.previousCell,
          noop: true,
        });
      }

      let cell: number;
      try {
        cell = runtime.move(current, x, y);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        x,
        y,
        cell,
        previousX: current.previousX,
        previousY: current.previousY,
        previousCell: current.previousCell,
        noop: false,
      });
    },
  };
}

export const moveMarkerTool = createMoveMarkerTool();
