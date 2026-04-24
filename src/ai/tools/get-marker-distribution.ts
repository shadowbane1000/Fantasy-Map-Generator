import { errorResult, getPack, okResult, type RawMarker } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { UNTYPED_MARKER_BUCKET } from "./list-marker-types";

export interface MarkerDistributionEntry {
  type: string;
  count: number;
  percentage: number;
}

export interface MarkerDistribution {
  total_markers: number;
  by_type: MarkerDistributionEntry[];
}

export interface MarkerDistributionPackLike {
  markers?: RawMarker[];
}

export type MarkerDistributionResult = MarkerDistribution | "not-ready";

/**
 * Pure aggregator — groups active markers by `marker.type` and returns
 * each bucket's `count` plus its `percentage` share of `total_markers`.
 *
 * Walk mirrors `list_marker_types` / `find_markers_by_type`:
 *  - skips `null` / `undefined` array slots,
 *  - skips the index-0 placeholder (`marker.i === 0`),
 *  - skips `removed: true`.
 *
 * Group key: the marker's `type` string verbatim (original casing
 * preserved) when it is a non-empty, non-whitespace string; otherwise
 * the `UNTYPED_MARKER_BUCKET` sentinel (`"untyped"`) matching the
 * behaviour of `list_marker_types`.
 *
 * `percentage` is `count / total_markers * 100` (floating); `0` when
 * `total_markers === 0`. Returns `"not-ready"` when `pack` or
 * `pack.markers` is missing.
 */
export function readMarkerDistributionFromPack(
  pack: MarkerDistributionPackLike | undefined,
): MarkerDistributionResult {
  if (!pack?.markers) return "not-ready";

  const counts = new Map<string, number>();
  let total = 0;

  for (const marker of pack.markers) {
    if (!marker) continue;
    if (marker.i === 0) continue;
    if (marker.removed) continue;

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

  const entries: MarkerDistributionEntry[] = Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
    });

  return { total_markers: total, by_type: entries };
}

export interface MarkerDistributionRuntime {
  readDistribution(): MarkerDistributionResult;
}

export const defaultMarkerDistributionRuntime: MarkerDistributionRuntime = {
  readDistribution(): MarkerDistributionResult {
    return readMarkerDistributionFromPack(
      getPack<MarkerDistributionPackLike>(),
    );
  },
};

export function createGetMarkerDistributionTool(
  runtime: MarkerDistributionRuntime = defaultMarkerDistributionRuntime,
): Tool {
  return {
    name: "get_marker_distribution",
    description: `Read aggregate counts and percentages per marker type (free-form point-of-interest label — castle, battlefield, volcano, shipwreck, mine, etc.) across the current map — the marker-level parallel of \`get_burg_distribution\` / \`get_river_distribution\` / \`get_feature_distribution\` / \`get_biome_distribution\` / \`get_culture_distribution\` and the percentage-aware companion to \`list_marker_types\` (which returns counts only). Iterates \`pack.markers\` linearly, skipping the index-0 placeholder, any \`removed: true\` markers, and null / undefined array slots (same walk \`list_marker_types\` / \`find_markers_by_type\` use). Each surviving marker is grouped by its \`marker.type\` string verbatim — non-empty, non-whitespace \`type\` values preserve their ORIGINAL casing (so \`"castle"\` and \`"Castle"\` are reported as distinct buckets, matching \`list_marker_types\`'s case-sensitive grouping — unlike the case-insensitive canonicalisation \`get_burg_distribution\` / \`get_river_distribution\` apply). Markers whose \`type\` is missing, null, non-string, empty, or whitespace-only land in the sentinel \`"untyped"\` bucket (the same bucket \`list_marker_types\` reports and \`find_markers_by_type\` selects). Per group, accumulates \`count\` and computes \`percentage\` — each group's share of \`total_markers\` — as \`count / total_markers * 100\`, floating, \`0\` when \`total_markers\` is \`0\`. Takes no parameters. Returns \`{ ok, total_markers, by_type }\` sorted by \`count\` descending with ties broken by \`type\` ascending (case-sensitive). When the map has no active markers, \`total_markers\` is \`0\` and \`by_type\` is \`[]\`, still \`ok: true\`. Useful for the "how are markers distributed by type?" / "what share of POIs are castles?" report, marker-inventory audits after bulk \`set_marker_type\` / \`remove_marker\` / \`add_marker\` edits, and feeding per-type percentages into higher-level narrative generation. Differs from \`list_marker_types\` in exactly one axis: the extra \`percentage\` field (and the wrapper key is \`by_type\` + \`total_markers\` to match the other \`get_*_distribution\` tools). Read-only — never mutates the pack. Errors only on un-generated map (\`pack\` / \`pack.markers\` missing). Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const result = runtime.readDistribution();
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getMarkerDistributionTool = createGetMarkerDistributionTool();
