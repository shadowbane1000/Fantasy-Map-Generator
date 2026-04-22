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

export interface MarkerLockRef {
  i: number;
  name: string;
  previousLocked: boolean;
}

export interface MarkerLockRuntime {
  find(ref: number | string): MarkerLockRef | null;
  setLock(i: number, locked: boolean): void;
}

export const defaultMarkerLockRuntime: MarkerLockRuntime = {
  find(ref) {
    const pack = getPack<MarkerNotePackLike>();
    const noteRef = findMarkerNoteRef(pack, getNotes<RawNote>(), ref);
    if (!noteRef) return null;
    const marker = pack?.markers?.find((m) => m?.i === noteRef.i);
    return {
      i: noteRef.i,
      name: noteRef.previousName ?? "",
      previousLocked: !!marker?.lock,
    };
  },
  setLock(i: number, locked: boolean): void {
    const markers = getPack<MarkerNotePackLike>()?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const marker = markers.find((m) => m?.i === i);
    if (!marker) throw new Error(`Marker ${i} not found.`);
    if (locked) (marker as RawMarker).lock = true;
    else delete (marker as RawMarker).lock;
  },
};

export function createSetMarkerLockTool(
  runtime: MarkerLockRuntime = defaultMarkerLockRuntime,
): Tool {
  return {
    name: "set_marker_lock",
    description:
      "Lock or unlock a marker (point of interest) — same side-effect as the lock icon in the Markers Overview. Writes marker.lock on lock and deletes the key on unlock. Locked markers are preserved across map regeneration, the same way other locked entities are. Idempotent: a noop is returned when the marker is already in the requested state. Markers match by numeric id or case-insensitive current note name.",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or current case-insensitive note name.",
        },
        locked: {
          type: "boolean",
          description: "true to lock, false to unlock.",
        },
      },
      required: ["marker", "locked"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        locked?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.locked !== "boolean") {
        return errorResult("locked must be a boolean.");
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      if (current.previousLocked === input.locked) {
        return okResult({
          i: current.i,
          name: current.name,
          locked: input.locked,
          previousLocked: current.previousLocked,
          noop: true,
        });
      }

      try {
        runtime.setLock(current.i, input.locked);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        locked: input.locked,
        previousLocked: current.previousLocked,
        noop: false,
      });
    },
  };
}

export const setMarkerLockTool = createSetMarkerLockTool();
