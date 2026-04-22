import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawBurg,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ZoomEntity {
  i: number;
  name: string;
  x: number;
  y: number;
}

export interface ZoomRuntime {
  findBurg(ref: number | string): ZoomEntity | null;
  findState(ref: number | string): ZoomEntity | null;
  zoomTo(x: number, y: number, z: number, d: number): void;
  resetZoom(d: number): void;
}

interface PackLike {
  burgs?: RawBurg[];
  states?: RawState[];
}

function findBurgInPack(
  pack: PackLike | undefined,
  ref: number | string,
): ZoomEntity | null {
  const entry = findEntityByRef(pack?.burgs, ref);
  if (!entry) return null;
  if (typeof entry.x !== "number" || typeof entry.y !== "number") return null;
  return { i: entry.i, name: entry.name ?? "", x: entry.x, y: entry.y };
}

function findStateInPack(
  pack: PackLike | undefined,
  ref: number | string,
): ZoomEntity | null {
  const entry = findEntityByRef(pack?.states, ref);
  if (!entry) return null;
  const pole = entry.pole;
  let coords: [number, number] | null = null;
  if (
    Array.isArray(pole) &&
    typeof pole[0] === "number" &&
    typeof pole[1] === "number"
  ) {
    coords = [pole[0], pole[1]];
  } else if (typeof entry.capital === "number" && entry.capital > 0) {
    const cap = pack?.burgs?.[entry.capital];
    if (cap && typeof cap.x === "number" && typeof cap.y === "number") {
      coords = [cap.x, cap.y];
    }
  }
  if (!coords) return null;
  return { i: entry.i, name: entry.name ?? "", x: coords[0], y: coords[1] };
}

export const defaultZoomRuntime: ZoomRuntime = {
  findBurg(ref) {
    return findBurgInPack(getPack<PackLike>(), ref);
  },
  findState(ref) {
    return findStateInPack(getPack<PackLike>(), ref);
  },
  zoomTo(x, y, z, d) {
    const fn =
      getGlobal<(x: number, y: number, z: number, d: number) => void>("zoomTo");
    if (typeof fn !== "function") throw new Error("zoomTo is not available.");
    fn(x, y, z, d);
  },
  resetZoom(d) {
    const fn = getGlobal<(d: number) => void>("resetZoom");
    if (typeof fn !== "function")
      throw new Error("resetZoom is not available.");
    fn(d);
  },
};

export const FOCUS_ZOOM_LEVEL = 8;
export const FOCUS_ZOOM_DURATION = 2000;
export const RESET_ZOOM_DURATION = 1000;

type FocusType = "burg" | "state" | "reset";

export function createFocusOnMapTool(
  runtime: ZoomRuntime = defaultZoomRuntime,
): Tool {
  return {
    name: "focus_on_map",
    description:
      "Zoom the map to a specific burg (city/town) or state, or reset the zoom to the full world view. Matches the UI behaviour of clicking a burg, a state label, or the 'reset zoom' control. Targets can be numeric ids or case-insensitive names.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["burg", "state", "reset"],
          description:
            "'burg' to focus a city/town, 'state' to focus a state, 'reset' to return to the full world view.",
        },
        target: {
          type: ["integer", "string"],
          description:
            "Numeric id or name of the burg/state. Required unless type is 'reset'.",
        },
      },
      required: ["type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        type?: unknown;
        target?: unknown;
      };

      if (
        input.type !== "burg" &&
        input.type !== "state" &&
        input.type !== "reset"
      ) {
        return errorResult("type must be one of 'burg', 'state', or 'reset'.");
      }
      const type: FocusType = input.type;

      if (type === "reset") {
        try {
          runtime.resetZoom(RESET_ZOOM_DURATION);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
        return okResult({ mode: "reset" });
      }

      const refResult = parseEntityRef(input.target, "target");
      if (!refResult.ok) return errorResult(refResult.error);

      const entity =
        type === "burg"
          ? runtime.findBurg(refResult.ref)
          : runtime.findState(refResult.ref);
      if (!entity) {
        return errorResult(
          `No ${type} found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      try {
        runtime.zoomTo(
          entity.x,
          entity.y,
          FOCUS_ZOOM_LEVEL,
          FOCUS_ZOOM_DURATION,
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        type,
        i: entity.i,
        name: entity.name,
        x: entity.x,
        y: entity.y,
      });
    },
  };
}

export const focusOnMapTool = createFocusOnMapTool();
export { findBurgInPack, findStateInPack };
