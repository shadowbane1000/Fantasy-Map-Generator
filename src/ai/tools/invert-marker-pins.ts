import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawMarker,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface InvertMarkerPinsResult {
  total: number;
  now_pinned: number;
  now_unpinned: number;
  any_pinned: boolean;
}

export interface InvertMarkerPinsRuntime {
  getMarkers(): RawMarker[] | undefined;
  setMarkerGroupPinned(value: 1 | null): void;
  drawMarkers?: () => void;
  addLines?: () => void;
}

export const defaultInvertMarkerPinsRuntime: InvertMarkerPinsRuntime = {
  getMarkers(): RawMarker[] | undefined {
    const pack = getPack<{ markers?: RawMarker[] }>();
    const markers = pack?.markers;
    return Array.isArray(markers) ? markers : undefined;
  },
  setMarkerGroupPinned(value: 1 | null): void {
    if (typeof document === "undefined") return;
    const group = document.getElementById("markers");
    if (!group) return;
    if (value === 1) group.setAttribute("pinned", "1");
    else group.removeAttribute("pinned");
  },
  drawMarkers(): void {
    const fn = getGlobal<() => void>("drawMarkers");
    if (typeof fn === "function") fn();
  },
  addLines(): void {
    const fn = getGlobal<() => void>("addLines");
    if (typeof fn === "function") fn();
  },
};

export function createInvertMarkerPinsTool(
  runtime: InvertMarkerPinsRuntime = defaultInvertMarkerPinsRuntime,
): Tool {
  return {
    name: "invert_marker_pins",
    description:
      'Flip the `pinned` flag on every marker in pack.markers — same side-effect as the "Invert pin" row-toolbar button in the Markers Overview (`invertPin` in `public/modules/ui/markers-overview.js`). For each marker: if `marker.pinned` is truthy, the field is DELETED (mirroring the "absent === not pinned" convention); otherwise `marker.pinned` is set to true. Updates the #markers SVG group\'s `pinned` attribute to "1" when any marker ended up pinned, otherwise removes it. Best-effort calls drawMarkers() and addLines() to refresh the layer + the overview rows. Mutates pack.markers in place. Takes no parameters. Distinct from set_marker_pinned (single marker).',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      let markers: RawMarker[] | undefined;
      try {
        markers = runtime.getMarkers();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (!Array.isArray(markers)) {
        return errorResult(
          "window.pack.markers is not available; the map hasn't finished loading.",
        );
      }

      let nowPinned = 0;
      for (const marker of markers) {
        if (!marker) continue;
        if (marker.pinned) {
          delete marker.pinned;
        } else {
          marker.pinned = true;
          nowPinned++;
        }
      }

      const total = markers.length;
      const nowUnpinned = total - nowPinned;
      const anyPinned = nowPinned > 0;

      try {
        runtime.setMarkerGroupPinned(anyPinned ? 1 : null);
      } catch {
        // Best-effort.
      }

      if (typeof runtime.drawMarkers === "function") {
        try {
          runtime.drawMarkers();
        } catch {
          // Best-effort.
        }
      }

      if (typeof runtime.addLines === "function") {
        try {
          runtime.addLines();
        } catch {
          // Best-effort.
        }
      }

      return okResult({
        total,
        now_pinned: nowPinned,
        now_unpinned: nowUnpinned,
        any_pinned: anyPinned,
      });
    },
  };
}

export const invertMarkerPinsTool = createInvertMarkerPinsTool();
