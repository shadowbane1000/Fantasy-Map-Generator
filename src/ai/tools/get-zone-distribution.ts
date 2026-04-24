import { errorResult, getPack, okResult, type RawZone } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Sentinel bucket label used when a zone's `type` is missing, not a
 * string, or empty / whitespace-only after trimming. Intentionally
 * lower-case to avoid colliding with any generator-emitted type
 * (which the UI convention capitalizes — Invasion, Disease, etc.).
 */
export const UNTYPED_ZONE_BUCKET = "untyped";

export interface ZoneDistributionEntry {
  type: string;
  count: number;
  cells: number;
  percentage: number;
}

export interface ZoneDistribution {
  total_zones: number;
  total_cells: number;
  by_type: ZoneDistributionEntry[];
}

export interface ZoneDistributionPackLike {
  zones?: RawZone[];
}

/**
 * Pure aggregator: given the world state (`pack`), group every active
 * zone in `pack.zones` by `zone.type` and compute per-group `count`,
 * summed `cells`, and share `percentage` of the total active zone
 * count. Skips `removed: true` entries and null / undefined array
 * slots. Zone ids are non-contiguous and start at 0, so `zone.i === 0`
 * is a real zone (not a placeholder). Types are grouped by their
 * original (trimmed, case-preserved) string value — no canonicalization
 * is applied. Zones whose `type` is missing, non-string, empty, or
 * whitespace-only fall back to the `"untyped"` bucket. `cells` per
 * group is the sum of `zone.cells.length` over the group's zones (0
 * when the array is missing or non-array). `percentage` is
 * `count / total_zones * 100` (floating, `0` when `total_zones` is
 * `0`). Returns `"not-ready"` when `pack` / `pack.zones` is missing.
 */
export function readZoneDistributionFromPack(
  pack: ZoneDistributionPackLike | undefined,
): ZoneDistribution | "not-ready" {
  if (!pack?.zones) return "not-ready";

  interface Bucket {
    type: string;
    count: number;
    cells: number;
  }

  const buckets = new Map<string, Bucket>();
  let totalZones = 0;
  let totalCells = 0;

  for (const zone of pack.zones) {
    if (!zone) continue;
    if (zone.removed) continue;

    let key: string;
    if (typeof zone.type === "string") {
      const trimmed = zone.type.trim();
      key = trimmed.length === 0 ? UNTYPED_ZONE_BUCKET : trimmed;
    } else {
      key = UNTYPED_ZONE_BUCKET;
    }

    const cellsLen = Array.isArray(zone.cells) ? zone.cells.length : 0;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { type: key, count: 0, cells: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.cells += cellsLen;
    totalZones += 1;
    totalCells += cellsLen;
  }

  const entries: ZoneDistributionEntry[] = [];
  for (const bucket of buckets.values()) {
    entries.push({
      type: bucket.type,
      count: bucket.count,
      cells: bucket.cells,
      percentage: totalZones > 0 ? (bucket.count / totalZones) * 100 : 0,
    });
  }

  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });

  return {
    total_zones: totalZones,
    total_cells: totalCells,
    by_type: entries,
  };
}

export interface ZoneDistributionRuntime {
  readDistribution(): ZoneDistribution | "not-ready";
}

export const defaultZoneDistributionRuntime: ZoneDistributionRuntime = {
  readDistribution(): ZoneDistribution | "not-ready" {
    return readZoneDistributionFromPack(getPack<ZoneDistributionPackLike>());
  },
};

export function createGetZoneDistributionTool(
  runtime: ZoneDistributionRuntime = defaultZoneDistributionRuntime,
): Tool {
  return {
    name: "get_zone_distribution",
    description: `Read aggregate counts and summed cell coverage per zone type across the current map — the zones-side parallel of \`get_burg_distribution\` / \`get_state_distribution\` / \`get_culture_distribution\` / \`get_religion_distribution\` and the aggregate companion to \`list_zones\` / \`find_zones_by_type\` / \`get_zone_info\`. Iterates \`pack.zones\` linearly, skipping any \`removed: true\` zones and null array slots — zone ids are non-contiguous and start at 0, so \`zone.i === 0\` is a real zone (not a placeholder) and is included. Each surviving zone is grouped by its \`zone.type\` string (trimmed, case-preserved — no canonicalization, so \`"Invasion"\` and \`"invasion"\` are kept as separate buckets reflecting the actual data on the map). Zones whose \`type\` is missing, non-string, empty, or whitespace-only are bucketed under the sentinel label \`"untyped"\` (lower-case on purpose so it never collides with generator-emitted types like Invasion / Rebels / Crusade / Disease / Proselytism / Disaster / Eruption / Avalanche / Flood or any user-defined custom type). Per group, accumulates \`count\` (number of zones) and \`cells\` (sum of \`zone.cells.length\` across the group's zones; \`0\` when a zone's \`cells\` array is missing or non-array). \`percentage\` is each group's share of \`total_zones\` — \`count / total_zones * 100\`, floating, \`0\` when \`total_zones\` is \`0\`. Takes no parameters. Returns \`{ ok, total_zones, total_cells, by_type }\` sorted by \`count\` descending with ties broken by \`type\` ascending (lexicographic, case-sensitive because types are case-preserved). When the map has no active zones, \`total_zones\` and \`total_cells\` are \`0\` and \`by_type\` is \`[]\`, still \`ok: true\`. Useful for the "how are zones distributed?" / "how many Invasion vs Disease zones does this map have?" report, sanity checks after zone-generator reruns or bulk \`set_zone_type\` edits, and feeding per-type counts into higher-level narrative generation. Read-only — never mutates the pack. Errors only on un-generated map (\`pack\` / \`pack.zones\` missing). Requires an Anthropic API key (see "Getting an API key" below).`,
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

export const getZoneDistributionTool = createGetZoneDistributionTool();
