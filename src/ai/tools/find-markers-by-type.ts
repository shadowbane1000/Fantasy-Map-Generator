import { errorResult, getPack, okResult, type RawMarker } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { UNTYPED_MARKER_BUCKET } from "./list-marker-types";

export const DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT = 10000;
export const MAX_FIND_MARKERS_BY_TYPE_LIMIT = 100000;

export interface FindMarkersByTypeHit {
  i: number;
  type: string | null;
  icon: string | null;
  x: number | null;
  y: number | null;
  cell: number | null;
}

export interface FindMarkersByTypePayload {
  type: string;
  markers: FindMarkersByTypeHit[];
  count: number;
}

export interface FindMarkersByTypeQuery {
  /**
   * Normalised type filter. Either a lowercased, trimmed non-empty type
   * string (matched case-insensitively against `marker.type.trim()`),
   * or the sentinel `UNTYPED_MARKER_BUCKET` which matches markers whose
   * type is missing, null, non-string, empty, or whitespace-only.
   */
  type: string;
  limit: number;
}

export type FindMarkersByTypeResult = FindMarkersByTypePayload | "not-ready";

interface PackLike {
  markers?: RawMarker[];
}

function markerTypeMatches(m: RawMarker, filter: string): boolean {
  if (filter === UNTYPED_MARKER_BUCKET) {
    if (typeof m.type !== "string") return true;
    return m.type.trim().length === 0;
  }
  if (typeof m.type !== "string") return false;
  return m.type.trim().toLowerCase() === filter;
}

/**
 * Pure scanner: collects every active marker in `pack.markers` whose
 * `type` matches the caller-supplied filter (case-insensitive after
 * trim). Skips the index-0 placeholder, `removed: true` entries, and
 * null / undefined array slots. When `query.type ===
 * UNTYPED_MARKER_BUCKET`, matches markers with missing / non-string /
 * empty / whitespace-only type. `count` reports the full total even
 * when `markers` is truncated by `limit`.
 */
export function findMarkersByTypeInPack(
  pack: PackLike | undefined,
  query: FindMarkersByTypeQuery,
): FindMarkersByTypeResult {
  if (!pack || !pack.markers) return "not-ready";

  const cap = query.limit > 0 ? query.limit : 0;
  const markers: FindMarkersByTypeHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.markers.length; k++) {
    const m = pack.markers[k];
    if (!m) continue;
    if (m.i === 0) continue;
    if (m.removed) continue;
    if (!markerTypeMatches(m, query.type)) continue;

    count++;
    if (markers.length < cap) {
      const mx = m.x;
      const my = m.y;
      const mcell = m.cell;
      // For the untyped bucket we report `type: null` so every hit is
      // shaped consistently — callers asked for "untyped" explicitly,
      // and empty / whitespace / non-string values are all equivalent
      // in that context.
      const typeForHit =
        query.type === UNTYPED_MARKER_BUCKET
          ? null
          : typeof m.type === "string"
            ? m.type
            : null;
      markers.push({
        i: m.i,
        type: typeForHit,
        icon: typeof m.icon === "string" ? m.icon : null,
        x: typeof mx === "number" && Number.isFinite(mx) ? mx : null,
        y: typeof my === "number" && Number.isFinite(my) ? my : null,
        cell:
          typeof mcell === "number" && Number.isInteger(mcell) ? mcell : null,
      });
    }
  }

  return { type: query.type, markers, count };
}

export interface FindMarkersByTypeRuntime {
  find(query: FindMarkersByTypeQuery): FindMarkersByTypeResult;
}

export const defaultFindMarkersByTypeRuntime: FindMarkersByTypeRuntime = {
  find(query) {
    return findMarkersByTypeInPack(getPack<PackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindMarkersByTypeQuery;
  error?: string;
}

function parseLimit(raw: unknown): number | string {
  if (raw === undefined || raw === null)
    return DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_FIND_MARKERS_BY_TYPE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_MARKERS_BY_TYPE_LIMIT}].`;
  }
  return raw;
}

function normalizeTypeFilter(raw: unknown): string | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: "type is required." };
  }
  if (typeof raw !== "string") {
    return { error: "type must be a string." };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return UNTYPED_MARKER_BUCKET;
  if (trimmed.toLowerCase() === UNTYPED_MARKER_BUCKET) {
    return UNTYPED_MARKER_BUCKET;
  }
  return trimmed.toLowerCase();
}

function parseInput(rawInput: unknown): ParsedInput {
  const args = (rawInput ?? {}) as {
    type?: unknown;
    limit?: unknown;
  };

  const typeFilter = normalizeTypeFilter(args.type);
  if (typeof typeFilter !== "string") return { error: typeFilter.error };

  const limitParsed = parseLimit(args.limit);
  if (typeof limitParsed === "string") return { error: limitParsed };

  return {
    query: {
      type: typeFilter,
      limit: limitParsed,
    },
  };
}

export function createFindMarkersByTypeTool(
  runtime: FindMarkersByTypeRuntime = defaultFindMarkersByTypeRuntime,
): Tool {
  return {
    name: "find_markers_by_type",
    description: `List every active marker (point of interest — castle, battle site, mine, volcano, shipwreck, etc.) whose \`marker.type\` matches a caller-supplied label — the type-only companion to \`find_markers_in_area\` (which adds a spatial constraint) and the detail-level companion to \`list_marker_types\` (which only returns counts). Required \`type\` (string) is matched case-insensitively against \`marker.type.trim()\`; an empty / whitespace-only \`type\`, or the literal \`"untyped"\` / \`"UNTYPED"\` (case-insensitive), selects markers whose type is missing, null, non-string, empty, or whitespace-only — the same sentinel bucket \`list_marker_types\` reports. Optional \`limit\` (integer in [1, ${MAX_FIND_MARKERS_BY_TYPE_LIMIT}], default ${DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT}) caps the returned \`markers\` array; \`count\` always reports the full unlimited total. Scans \`pack.markers\` linearly, skipping the index-0 placeholder, any \`removed: true\` markers, and any null slots. Returns \`{ ok, type, markers, count }\` where each marker is \`{ i, type, icon, x, y, cell }\` — \`type\` is the original (untrimmed, case-preserved) \`marker.type\` string (or \`null\` for the \`"untyped"\` bucket), \`icon\` / \`x\` / \`y\` / \`cell\` are echoed when they have the expected shape else \`null\`. When no marker matches, \`markers\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on missing map (\`pack\` or \`pack.markers\` not ready), missing / non-string \`type\`, or out-of-range \`limit\`. Useful as a first step for bulk marker operations keyed by type — audit every castle on the map, feed marker ids into \`get_marker_info\`, or filter candidates for \`set_marker_type\` / \`set_marker_icon\` / \`move_marker\` / \`remove_marker\` without any spatial filter. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Marker type to filter on. Case-insensitive exact match against `marker.type.trim()`. Empty / whitespace-only string or the literal 'untyped' (case-insensitive) selects markers whose type is missing, null, non-string, empty, or whitespace-only.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_MARKERS_BY_TYPE_LIMIT,
          description: `Maximum markers to return in the response (default ${DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["type"],
    },
    execute(input: unknown): ToolResult {
      const parsed = parseInput(input);
      if (parsed.error) return errorResult(parsed.error);
      const query = parsed.query as FindMarkersByTypeQuery;
      const result = runtime.find(query);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({
        type: result.type,
        markers: result.markers,
        count: result.count,
      });
    },
  };
}

export const findMarkersByTypeTool = createFindMarkersByTypeTool();
