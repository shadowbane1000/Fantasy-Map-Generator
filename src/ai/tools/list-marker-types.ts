import { errorResult, getPack, okResult, type RawMarker } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const UNTYPED_MARKER_BUCKET = "untyped";

export interface MarkerTypeCount {
  type: string;
  count: number;
}

export interface MarkerTypesSummary {
  types: MarkerTypeCount[];
  total: number;
}

export interface MarkerTypesPackLike {
  markers?: RawMarker[];
}

/**
 * Pure scanner — groups active markers by `marker.type` and returns
 * counts sorted by count descending (ties broken by type ascending).
 *
 * Returns `null` when the pack isn't ready (no pack or missing
 * `markers` collection).
 */
export function readMarkerTypesFromPack(
  pack: MarkerTypesPackLike | undefined,
): MarkerTypesSummary | null {
  if (!pack?.markers) return null;
  const counts = new Map<string, number>();
  let total = 0;
  for (const marker of pack.markers) {
    if (!marker) continue;
    if (marker.removed) continue;
    if (marker.i === 0) continue;
    let key: string;
    if (typeof marker.type === "string") {
      const trimmed = marker.type.trim();
      key = trimmed.length > 0 ? marker.type : UNTYPED_MARKER_BUCKET;
    } else {
      key = UNTYPED_MARKER_BUCKET;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  const types: MarkerTypeCount[] = Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
    });
  return { types, total };
}

export interface MarkerTypesRuntime {
  readMarkerTypes(): MarkerTypesSummary | null;
}

export const defaultMarkerTypesRuntime: MarkerTypesRuntime = {
  readMarkerTypes(): MarkerTypesSummary | null {
    return readMarkerTypesFromPack(getPack<MarkerTypesPackLike>());
  },
};

export function createListMarkerTypesTool(
  runtime: MarkerTypesRuntime = defaultMarkerTypesRuntime,
): Tool {
  return {
    name: "list_marker_types",
    description: `List the distinct \`marker.type\` values currently assigned to active markers on the map, each with its count — the summary companion to \`list_markers\` and \`set_marker_type\`. Scans \`pack.markers\`, skips removed entries and any \`i === 0\` placeholder, and groups by \`marker.type\`. Markers whose \`type\` is missing, null, non-string, empty, or whitespace-only are bucketed under the sentinel string \`"untyped"\` (non-empty types preserve their original casing verbatim). Returns \`{ ok, types, total }\` where \`types\` is an array of \`{type, count}\` sorted by \`count\` descending, ties broken by \`type\` ascending (case-sensitive), and \`total\` is the sum of active markers scanned. Takes no parameters. Read-only. Useful before bulk operations — discover which type labels exist, then filter \`list_markers\` / \`find_markers_in_area\` / \`find_nearest_marker\` by the chosen \`type\` or pass it to \`set_marker_type\`. Distinct from \`list_marker_pins\`, which returns the fixed catalogue of pin *shape* identifiers (inputs to \`set_marker_pin\`), not the data-dependent types actually in use. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const summary = runtime.readMarkerTypes();
      if (!summary) {
        return errorResult(
          "Map is not ready yet; cannot list marker types. Wait for the 'map:generated' event on window.",
        );
      }
      return okResult({ types: summary.types, total: summary.total });
    },
  };
}

export const listMarkerTypesTool = createListMarkerTypesTool();
