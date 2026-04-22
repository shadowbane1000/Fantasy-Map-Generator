import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface MapInfo {
  mapName: string | null;
  seed: string | null;
  mapId: number | null;
  dimensions: { width: number; height: number } | null;
  year: number | null;
  era: string | null;
  counts: {
    states: number;
    provinces: number;
    burgs: number;
    religions: number;
    cultures: number;
    rivers: number;
    markers: number;
    zones: number;
    cells: number;
    points: number;
  };
}

export interface MapStateRuntime {
  readState(): MapInfo | null;
}

function safeLen(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return 0;
}

function subtractNeutral(len: number): number {
  return len > 0 ? len - 1 : 0;
}

interface WindowLike {
  pack?: {
    states?: unknown[];
    provinces?: unknown[];
    burgs?: unknown[];
    religions?: unknown[];
    cultures?: unknown[];
    rivers?: unknown[];
    markers?: unknown[];
    zones?: unknown[];
    cells?: { i?: unknown[] };
  };
  grid?: { points?: unknown[] };
  seed?: string | number;
  mapId?: number;
  graphWidth?: number;
  graphHeight?: number;
  options?: { year?: number; era?: string };
}

function readFromWindow(win: WindowLike): MapInfo | null {
  const pack = win.pack;
  if (!pack) return null;

  const mapNameEl =
    typeof document !== "undefined"
      ? (document.getElementById("mapName") as HTMLInputElement | null)
      : null;

  const width = typeof win.graphWidth === "number" ? win.graphWidth : null;
  const height = typeof win.graphHeight === "number" ? win.graphHeight : null;
  const dimensions =
    width !== null && height !== null ? { width, height } : null;

  return {
    mapName: mapNameEl?.value ?? null,
    seed: win.seed !== undefined && win.seed !== null ? String(win.seed) : null,
    mapId: typeof win.mapId === "number" ? win.mapId : null,
    dimensions,
    year: typeof win.options?.year === "number" ? win.options.year : null,
    era: typeof win.options?.era === "string" ? win.options.era : null,
    counts: {
      states: subtractNeutral(safeLen(pack.states)),
      provinces: subtractNeutral(safeLen(pack.provinces)),
      burgs: subtractNeutral(safeLen(pack.burgs)),
      religions: subtractNeutral(safeLen(pack.religions)),
      cultures: subtractNeutral(safeLen(pack.cultures)),
      rivers: safeLen(pack.rivers),
      markers: safeLen(pack.markers),
      zones: safeLen(pack.zones),
      cells: safeLen(pack.cells?.i),
      points: safeLen(win.grid?.points),
    },
  };
}

export const defaultMapStateRuntime: MapStateRuntime = {
  readState(): MapInfo | null {
    return readFromWindow(globalThis as WindowLike);
  },
};

export function createGetMapInfoTool(
  runtime: MapStateRuntime = defaultMapStateRuntime,
): Tool {
  return {
    name: "get_map_info",
    description:
      "Read a summary of the currently generated map: map name, seed, dimensions, year/era, and counts of states, provinces, burgs, religions, cultures, rivers, markers, zones, and cells. Useful before taking any other action, so you know what's on the map.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const state = runtime.readState();
      if (!state) {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...state });
    },
  };
}

export const getMapInfoTool = createGetMapInfoTool();
