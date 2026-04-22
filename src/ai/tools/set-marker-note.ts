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

export interface MarkerNoteRef {
  i: number;
  previousName: string | null;
  previousLegend: string | null;
}

export interface MarkerNoteRuntime {
  find(ref: number | string): MarkerNoteRef | null;
  setNote(i: number, name: string, legend: string | undefined): void;
}

export interface MarkerNotePackLike {
  markers?: RawMarker[];
}

function noteIdFor(i: number): string {
  return `marker${i}`;
}

function markerExists(
  pack: MarkerNotePackLike | undefined,
  i: number,
): boolean {
  const markers = pack?.markers;
  if (!markers) return false;
  return markers.some((m) => m && m.i === i && !m.removed);
}

export function findMarkerNoteRef(
  pack: MarkerNotePackLike | undefined,
  notes: RawNote[] | undefined,
  ref: number | string,
): MarkerNoteRef | null {
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref <= 0) return null;
    if (!markerExists(pack, ref)) return null;
    const note = (notes ?? []).find((n) => n && n.id === noteIdFor(ref));
    return {
      i: ref,
      previousName: note?.name ?? null,
      previousLegend: note?.legend ?? null,
    };
  }
  if (typeof ref !== "string") return null;
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  for (const n of notes ?? []) {
    if (!n || typeof n.id !== "string" || !n.id.startsWith("marker")) continue;
    if ((n.name ?? "").toLowerCase() !== needle) continue;
    const i = Number.parseInt(n.id.slice(6), 10);
    if (!Number.isInteger(i) || i <= 0) continue;
    if (!markerExists(pack, i)) continue;
    return {
      i,
      previousName: n.name ?? null,
      previousLegend: n.legend ?? null,
    };
  }
  return null;
}

export const defaultMarkerNoteRuntime: MarkerNoteRuntime = {
  find(ref) {
    return findMarkerNoteRef(
      getPack<MarkerNotePackLike>(),
      getNotes<RawNote>(),
      ref,
    );
  },
  setNote(i: number, name: string, legend: string | undefined): void {
    const win = globalThis as { notes?: RawNote[] };
    if (!win.notes) win.notes = [];
    const id = noteIdFor(i);
    const existing = win.notes.find((n) => n && n.id === id);
    if (existing) {
      existing.name = name;
      if (legend !== undefined) existing.legend = legend;
      return;
    }
    win.notes.push({ id, name, legend: legend ?? "" });
  },
};

export function createSetMarkerNoteTool(
  runtime: MarkerNoteRuntime = defaultMarkerNoteRuntime,
): Tool {
  return {
    name: "set_marker_note",
    description:
      "Rename a marker (point of interest) and/or update its legend. Marker display names live in the global notes list — the same place the Notes Editor writes to. If no note exists yet for the marker, one is created. Accepts either a numeric marker id or the current note name (case-insensitive).",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or the marker's current note name (case-insensitive).",
        },
        name: {
          type: "string",
          description: "New display name. Required, non-empty.",
        },
        legend: {
          type: "string",
          description:
            "Optional new legend (lore / description). Pass an empty string to clear. Whitespace-only values are rejected.",
        },
      },
      required: ["marker", "name"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        marker?: unknown;
        name?: unknown;
        legend?: unknown;
      };

      const refResult = parseEntityRef(input.marker, "marker");
      if (!refResult.ok) return errorResult(refResult.error);
      if (typeof input.name !== "string" || !input.name.trim()) {
        return errorResult("name must be a non-empty string.");
      }

      let legend: string | undefined;
      if (input.legend !== undefined && input.legend !== null) {
        if (typeof input.legend !== "string") {
          return errorResult("legend, if provided, must be a string.");
        }
        // Allow empty string (clear) but not whitespace-only.
        if (input.legend !== "" && !input.legend.trim()) {
          return errorResult(
            "legend must be empty ('') or contain non-whitespace characters.",
          );
        }
        legend = input.legend;
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No marker found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }

      const newName = input.name.trim();
      try {
        runtime.setNote(current.i, newName, legend);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        previousName: current.previousName,
        previousLegend: current.previousLegend,
        name: newName,
        legend: legend !== undefined ? legend : (current.previousLegend ?? ""),
      });
    },
  };
}

export const setMarkerNoteTool = createSetMarkerNoteTool();
