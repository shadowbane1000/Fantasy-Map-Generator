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

export interface MarkerAddInput {
  x: number;
  y: number;
  type?: string;
  icon?: string;
  name?: string;
  legend?: string;
  lock?: boolean;
}

export interface NewMarker {
  i: number;
  type: string;
  icon: string;
  x: number;
  y: number;
  cell: number;
  name: string | null;
  legend: string | null;
  lock: boolean;
}

export interface MarkerAddRuntime {
  add(input: MarkerAddInput): NewMarker;
}

interface MarkerAddPackLike {
  markers?: RawMarker[];
}

export const defaultMarkerAddRuntime: MarkerAddRuntime = {
  add(input: MarkerAddInput): NewMarker {
    const pack = getPack<MarkerAddPackLike>();
    const markers = pack?.markers;
    if (!Array.isArray(markers)) {
      throw new Error("pack.markers is not available.");
    }
    const findCell = getGlobal<(x: number, y: number) => number>("findCell");
    if (typeof findCell !== "function") {
      throw new Error("findCell is not available yet.");
    }
    const cell = findCell(input.x, input.y);
    const lastMarker = markers[markers.length - 1];
    const i = (typeof lastMarker?.i === "number" ? lastMarker.i : 0) + 1;
    const type = input.type ?? "custom";
    const icon = input.icon ?? "📍";
    const marker: RawMarker = {
      i,
      type,
      icon,
      x: input.x,
      y: input.y,
      cell,
    };
    if (input.lock) marker.lock = true;
    markers.push(marker);

    let createdNoteName: string | null = null;
    let createdLegend: string | null = null;
    if (input.name) {
      let notes = getNotes<RawNote>();
      if (!Array.isArray(notes)) {
        const win = globalThis as { notes?: RawNote[] };
        win.notes = [];
        notes = win.notes;
      }
      const legend = input.legend ?? "";
      notes.push({ id: `marker${i}`, name: input.name, legend });
      createdNoteName = input.name;
      createdLegend = legend;
    }

    const draw = getGlobal<() => void>("drawMarkers");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: the data mutation already happened.
      }
    }

    return {
      i,
      type,
      icon,
      x: input.x,
      y: input.y,
      cell,
      name: createdNoteName,
      legend: createdLegend,
      lock: !!input.lock,
    };
  },
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function createAddMarkerTool(
  runtime: MarkerAddRuntime = defaultMarkerAddRuntime,
): Tool {
  return {
    name: "add_marker",
    description:
      'Place a new marker (point of interest) on the map at (x, y). Uses the global findCell(x,y) to compute the cell, pushes onto pack.markers with a fresh id, optionally creates a matching note (id `marker{i}`) if `name` is supplied, and calls drawMarkers() to render. Defaults: type "custom", icon "📍". Same observable effect as clicking to add a marker via the Markers Editor.',
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate (map pixel space)." },
        y: { type: "number", description: "Y coordinate (map pixel space)." },
        type: {
          type: "string",
          description:
            "Marker type. Free-form; default 'custom'. Known generator types (volcanoes, mines, dungeons, …) will match a config and run generator-specific wiring.",
        },
        icon: {
          type: "string",
          description:
            "Unicode glyph or short string used as the marker's icon. Default 📍.",
        },
        name: {
          type: "string",
          description:
            "Optional display name. Creates a note with id marker{i}.",
        },
        legend: {
          type: "string",
          description:
            "Optional legend / lore text. Ignored if `name` is not provided.",
        },
        lock: {
          type: "boolean",
          description:
            "If true, marks the marker as locked (preserved across regeneration).",
        },
      },
      required: ["x", "y"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;

      if (!isFiniteNumber(input.x)) {
        return errorResult("x must be a finite number.");
      }
      if (!isFiniteNumber(input.y)) {
        return errorResult("y must be a finite number.");
      }

      for (const field of ["type", "icon", "name", "legend"] as const) {
        const v = input[field];
        if (v === undefined || v === null) continue;
        if (typeof v !== "string" || !v.trim()) {
          return errorResult(
            `${field}, if provided, must be a non-empty string.`,
          );
        }
      }
      if (input.lock !== undefined && input.lock !== null) {
        if (typeof input.lock !== "boolean") {
          return errorResult("lock, if provided, must be a boolean.");
        }
      }

      const markerInput: MarkerAddInput = {
        x: input.x,
        y: input.y,
        type: typeof input.type === "string" ? input.type.trim() : undefined,
        icon: typeof input.icon === "string" ? input.icon.trim() : undefined,
        name: typeof input.name === "string" ? input.name.trim() : undefined,
        legend: typeof input.legend === "string" ? input.legend : undefined,
        lock: typeof input.lock === "boolean" ? input.lock : undefined,
      };

      try {
        const created = runtime.add(markerInput);
        return okResult({ ...created });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addMarkerTool = createAddMarkerTool();
