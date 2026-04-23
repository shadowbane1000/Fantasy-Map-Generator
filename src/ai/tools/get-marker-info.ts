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

/** Maximum number of characters of a marker note legend to echo back
 * to the chat. Longer legends are truncated with a trailing "…" and a
 * `legend_truncated: true` flag. Keeps responses compact while still
 * conveying the gist of the legend. */
export const MARKER_LEGEND_MAX_CHARS = 2000;

export interface MarkerColors {
  fill: string | null;
  stroke: string | null;
}

export interface MarkerNoteInfo {
  id: string | null;
  name: string | null;
  legend: string | null;
  legend_truncated?: true;
}

export interface MarkerInfo {
  i: number;
  type: string | null;
  icon: string | null;
  x: number;
  y: number;
  cell: number;
  size: number | null;
  px: number | null;
  dx: number | null;
  dy: number | null;
  colors: MarkerColors;
  pin: string | null;
  pinned: boolean;
  lock: boolean;
  note: MarkerNoteInfo;
}

export type ReadMarkerInfoResult = MarkerInfo | "not-ready" | "not-found";

export interface MarkerInfoPackLike extends MarkerNotePackLike {
  markers?: RawMarker[];
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function numOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function truncateLegend(legend: string): {
  value: string;
  truncated: boolean;
} {
  if (legend.length <= MARKER_LEGEND_MAX_CHARS) {
    return { value: legend, truncated: false };
  }
  // Reserve one char for the ellipsis.
  return {
    value: `${legend.slice(0, MARKER_LEGEND_MAX_CHARS - 1)}…`,
    truncated: true,
  };
}

export function readMarkerInfoFromPack(
  pack: MarkerInfoPackLike | undefined,
  notes: RawNote[] | undefined,
  ref: number | string,
): ReadMarkerInfoResult {
  if (!pack?.markers) return "not-ready";

  const noteRef = findMarkerNoteRef(pack, notes, ref);
  if (!noteRef) return "not-found";

  const marker = pack.markers.find((m) => m && m.i === noteRef.i);
  if (!marker || marker.removed) return "not-found";

  const noteId = `marker${marker.i}`;
  const note = (notes ?? []).find((n) => n && n.id === noteId);

  const noteInfo: MarkerNoteInfo = note
    ? {
        id: noteId,
        name: typeof note.name === "string" ? note.name : null,
        legend: null,
      }
    : { id: null, name: null, legend: null };

  if (note && typeof note.legend === "string") {
    const { value, truncated } = truncateLegend(note.legend);
    noteInfo.legend = value;
    if (truncated) noteInfo.legend_truncated = true;
  }

  const colors: MarkerColors = {
    fill: strOrNull(marker.fill),
    stroke: strOrNull(marker.stroke),
  };

  return {
    i: marker.i,
    type: strOrNull(marker.type),
    icon: strOrNull(marker.icon),
    x: numOrZero(marker.x),
    y: numOrZero(marker.y),
    cell: numOrZero(marker.cell),
    size: numOrNull(marker.size),
    px: numOrNull(marker.px),
    dx: numOrNull(marker.dx),
    dy: numOrNull(marker.dy),
    colors,
    pin: strOrNull(marker.pin),
    pinned: !!marker.pinned,
    lock: !!marker.lock,
    note: noteInfo,
  };
}

export interface MarkerInfoRuntime {
  readMarker(ref: number | string): ReadMarkerInfoResult;
}

export const defaultMarkerInfoRuntime: MarkerInfoRuntime = {
  readMarker(ref: number | string): ReadMarkerInfoResult {
    return readMarkerInfoFromPack(
      getPack<MarkerInfoPackLike>(),
      getNotes<RawNote>(),
      ref,
    );
  },
};

export function createGetMarkerInfoTool(
  runtime: MarkerInfoRuntime = defaultMarkerInfoRuntime,
): Tool {
  return {
    name: "get_marker_info",
    description:
      "Read detailed info for a single marker (point of interest — castle, battle site, mine, volcano, shipwreck, etc.) — the per-marker parallel of get_burg_info / get_state_info / get_province_info / get_river_info. Required `marker` identifies the marker by numeric id (> 0) or the marker's current case-insensitive note name (resolved via the shared findMarkerNoteRef; skips removed markers). Returns `i`, `type` (free-form label grouping — marker.type), `icon` (marker.icon), `x` / `y` (SVG pixel coords from marker.x / marker.y), `cell` (marker.cell), `size` (pin size — marker.size), `px` (icon size in px — marker.px), `dx` / `dy` (horizontal / vertical icon shifts — marker.dx / marker.dy), `colors` ({fill, stroke} — raw marker.fill / marker.stroke; null when unset — the renderer falls back to DEFAULT_MARKER_FILL `#ffffff` / DEFAULT_MARKER_STROKE `#000000`), `pin` (pin shape — marker.pin; null when unset — renderer default is 'bubble'), `pinned` (boolean — marker.pinned), `lock` (boolean — marker.lock), and `note` ({id, name, legend} — the related entry from window.notes looked up by id === 'marker' + i; all three null when no note exists; legends longer than 2000 chars are truncated with a trailing '…' and a `legend_truncated: true` flag). Useful before taking any marker-targeted action (set_marker_type, set_marker_icon, set_marker_colors, set_marker_pin, set_marker_pinned, set_marker_lock, set_marker_note, set_marker_size, set_marker_icon_size, set_marker_shift, move_marker, remove_marker). Errors on un-generated map, an unresolvable ref, or a removed marker. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        marker: {
          type: ["integer", "string"],
          description:
            "Numeric marker id (> 0) or the marker's current case-insensitive note name.",
        },
      },
      required: ["marker"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { marker?: unknown };

      const parsed = parseEntityRef(input.marker, "marker");
      if (!parsed.ok) return errorResult(parsed.error);

      const result = runtime.readMarker(parsed.ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No marker found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getMarkerInfoTool = createGetMarkerInfoTool();
