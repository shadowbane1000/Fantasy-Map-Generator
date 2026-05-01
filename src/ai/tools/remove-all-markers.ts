import {
  errorResult,
  getGlobal,
  getNotes,
  getPack,
  okResult,
  type RawMarker,
  type RawNote,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Bulk-remove every non-locked marker from the map — same side-effect
 * as the Markers Overview's "Remove all markers" button (the
 * `removeAllMarkers` function in
 * `public/modules/ui/markers-overview.js`):
 *
 * ```js
 * function removeAllMarkers() {
 *   pack.markers = pack.markers.filter(({i, lock}) => {
 *     if (lock) return true;
 *     const id = `marker${i}`;
 *     byId(id)?.remove();
 *     notes = notes.filter(note => note.id !== id);
 *     return false;
 *   });
 *   addLines();
 * }
 * ```
 *
 * Three side effects, in order:
 *
 * 1. `pack.markers` is REASSIGNED (not mutated in place) to the
 *    locked-only subset.
 * 2. The SVG `<g id="marker${i}">` element is removed for each dropped
 *    marker (best-effort).
 * 3. `window.notes` is REASSIGNED to drop entries with matching
 *    `marker${i}` ids (best-effort — silently skipped if `notes`
 *    isn't an array).
 *
 * Plus a fourth: `addLines()` is called to refresh the markers
 * overview list (no-op when the panel isn't open).
 *
 * Locked markers (`marker.lock === true`) are PRESERVED — matching
 * the UI behaviour. There is no undo.
 */

interface MutableMarkerPack {
  markers?: RawMarker[];
}

export interface RemoveAllMarkersRuntime {
  /** Return `pack.markers` if it's an array, otherwise undefined. */
  getMarkers(): RawMarker[] | undefined;
  /** REASSIGN `pack.markers = arr` (not in-place). */
  setMarkers(arr: RawMarker[]): void;
  /** Return `window.notes` if it's an array, otherwise undefined. */
  getNotes(): RawNote[] | undefined;
  /** REASSIGN `globalThis.notes = arr` (not in-place). */
  setNotes(arr: RawNote[]): void;
  /** Best-effort: remove the SVG element with this id. Swallow errors. */
  removeDomNode(id: string): void;
  /** Best-effort: refresh the markers overview list. Swallow errors. */
  addLines?(): void;
}

export const defaultRemoveAllMarkersRuntime: RemoveAllMarkersRuntime = {
  getMarkers(): RawMarker[] | undefined {
    const pack = getPack<MutableMarkerPack>();
    const markers = pack?.markers;
    return Array.isArray(markers) ? markers : undefined;
  },
  setMarkers(arr: RawMarker[]): void {
    const pack = getPack<MutableMarkerPack>();
    if (pack) pack.markers = arr;
  },
  getNotes(): RawNote[] | undefined {
    return getNotes<RawNote>();
  },
  setNotes(arr: RawNote[]): void {
    (globalThis as Record<string, unknown>).notes = arr;
  },
  removeDomNode(id: string): void {
    if (typeof document === "undefined") return;
    try {
      document.getElementById(id)?.remove();
    } catch {
      // best-effort: SVG state churn can throw; we don't want a
      // half-cleared world.
    }
  },
  addLines(): void {
    const fn = getGlobal<() => void>("addLines");
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch {
      // best-effort: the markers overview may not be open or may be
      // mid-mutation; never fail the tool because of it.
    }
  },
};

export function createRemoveAllMarkersTool(
  runtime: RemoveAllMarkersRuntime = defaultRemoveAllMarkersRuntime,
): Tool {
  return {
    name: "remove_all_markers",
    description:
      'Bulk-remove every non-locked marker (point of interest) from the map — same side-effect as the "Remove all markers" button in the Markers Overview (`removeAllMarkers` in `public/modules/ui/markers-overview.js`). Reassigns `pack.markers` to the locked-only subset, removes each dropped marker\'s `<g id="marker{i}">` SVG element, and prunes corresponding `window.notes` entries (id `marker{i}`). Locked markers (`marker.lock === true`) are PRESERVED — they survive the bulk wipe, matching the UI. Destructive: there is no undo. No parameters. Returns `{ previous_count, removed_count, kept_count, removed_marker_ids, removed_marker_ids_truncated }` where `removed_marker_ids` lists up to the first 50 removed ids in ascending order; `removed_marker_ids_truncated` is `true` when more than 50 markers were removed.',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const markers = runtime.getMarkers();
      if (!Array.isArray(markers)) {
        return errorResult(
          "window.pack.markers is not available; the map hasn't finished loading.",
        );
      }

      const kept: RawMarker[] = [];
      const removedIds: number[] = [];
      for (const m of markers) {
        if (!m) continue;
        if (m.lock === true) {
          kept.push(m);
        } else {
          removedIds.push(m.i);
        }
      }

      const previous_count = markers.length;
      const removed_count = removedIds.length;
      const kept_count = kept.length;

      for (const id of removedIds) {
        runtime.removeDomNode(`marker${id}`);
      }

      try {
        runtime.setMarkers(kept);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (removedIds.length > 0) {
        const notes = runtime.getNotes();
        if (Array.isArray(notes)) {
          const removedSet = new Set(removedIds.map((i) => `marker${i}`));
          const filtered = notes.filter((n) => !(n && removedSet.has(n.id)));
          try {
            runtime.setNotes(filtered);
          } catch (err) {
            return errorResult(
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      }

      runtime.addLines?.();

      const sorted = [...removedIds].sort((a, b) => a - b);
      const truncated = sorted.length > 50;
      const removed_marker_ids = truncated ? sorted.slice(0, 50) : sorted;

      return okResult({
        previous_count,
        removed_count,
        kept_count,
        removed_marker_ids,
        removed_marker_ids_truncated: truncated,
      });
    },
  };
}

export const removeAllMarkersTool = createRemoveAllMarkersTool();
