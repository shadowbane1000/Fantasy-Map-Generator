import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawMarker,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface InvertMarkerLocksResult {
  total: number;
  now_locked: number;
  now_unlocked: number;
}

export interface InvertMarkerLocksRuntime {
  getMarkers(): RawMarker[] | undefined;
  setMarkers(arr: RawMarker[]): void;
  addLines?: () => void;
}

export const defaultInvertMarkerLocksRuntime: InvertMarkerLocksRuntime = {
  getMarkers(): RawMarker[] | undefined {
    const pack = getPack<{ markers?: RawMarker[] }>();
    const markers = pack?.markers;
    return Array.isArray(markers) ? markers : undefined;
  },
  setMarkers(arr: RawMarker[]): void {
    const pack = getPack<{ markers?: RawMarker[] }>();
    if (pack) pack.markers = arr;
  },
  addLines(): void {
    const fn = getGlobal<() => void>("addLines");
    if (typeof fn === "function") fn();
  },
};

export function createInvertMarkerLocksTool(
  runtime: InvertMarkerLocksRuntime = defaultInvertMarkerLocksRuntime,
): Tool {
  return {
    name: "invert_marker_locks",
    description:
      'Flip the `lock` flag on every marker in pack.markers — same side-effect as the "Invert lock" row-toolbar button in the Markers Overview (`invertLock` in `public/modules/ui/markers-overview.js`). REASSIGNS `pack.markers` to a NEW array of CLONED marker objects with `lock` set to the plain boolean negation of the previous value (`!marker.lock`, so `!undefined === true` — a marker with no `lock` field becomes locked). Original marker objects are NOT mutated. Iterates ALL markers, including `removed` ones. Best-effort calls `addLines()` to refresh the markers overview rows. Takes no parameters. Returns `{ total, now_locked, now_unlocked }`. Distinct from `set_marker_lock` (single marker; uses `delete` for unlock). Distinct from `invert_marker_pins` (mutates in place; uses `delete` for the off path).',
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

      const next: RawMarker[] = markers.map((m) => ({
        ...m,
        lock: !m?.lock,
      }));

      try {
        runtime.setMarkers(next);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (typeof runtime.addLines === "function") {
        try {
          runtime.addLines();
        } catch {
          // Best-effort.
        }
      }

      const total = next.length;
      let nowLocked = 0;
      for (const m of next) {
        if (m.lock === true) nowLocked++;
      }
      const nowUnlocked = total - nowLocked;

      return okResult({
        total,
        now_locked: nowLocked,
        now_unlocked: nowUnlocked,
      });
    },
  };
}

export const invertMarkerLocksTool = createInvertMarkerLocksTool();
