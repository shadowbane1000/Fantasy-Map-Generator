import { errorResult, getPack, okResult, type RawRiver } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RiverDistributionEntry {
  type: string;
  count: number;
  length: number;
  percentage: number;
}

export interface RiverDistribution {
  total_rivers: number;
  total_length: number;
  by_type: RiverDistributionEntry[];
}

export interface RiverDistributionPackLike {
  rivers?: RawRiver[];
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Pure aggregator: given the world state (`pack`), walk `pack.rivers`,
 * skip the index-0 placeholder and any falsy / `removed: true` entry,
 * bucket each surviving river by its effective type, and compute per-group
 * `{count, length, percentage}` plus `total_rivers` / `total_length`.
 *
 * Effective type is `river.type` (any non-empty string — the generator
 * commonly produces `River`, `Stream`, `Creek`, `Brook`, `Fork`, `Branch`,
 * but `set_river_type` accepts free-form labels like `Canal`, `Ravine`,
 * etc.); otherwise `"unknown"` when the raw river omits it or has a
 * non-string / empty-string value. Sorting: `count` desc, then `type`
 * asc on ties. Returns `"not-ready"` when `pack` / `pack.rivers` is
 * missing.
 */
export function readRiverDistributionFromPack(
  pack: RiverDistributionPackLike | undefined,
): RiverDistribution | "not-ready" {
  if (!pack?.rivers) return "not-ready";

  interface Bucket {
    type: string;
    count: number;
    length: number;
  }
  const buckets = new Map<string, Bucket>();
  let totalRivers = 0;
  let totalLength = 0;

  for (const river of pack.rivers) {
    if (!river || typeof river !== "object") continue;
    if (river.i === 0) continue;
    if (river.removed) continue;

    totalRivers += 1;
    const len = numeric(river.length);
    totalLength += len;

    const effectiveType =
      typeof river.type === "string" && river.type.length > 0
        ? river.type
        : "unknown";

    let bucket = buckets.get(effectiveType);
    if (!bucket) {
      bucket = { type: effectiveType, count: 0, length: 0 };
      buckets.set(effectiveType, bucket);
    }
    bucket.count += 1;
    bucket.length += len;
  }

  const by_type: RiverDistributionEntry[] = Array.from(buckets.values())
    .map((b) => ({
      type: b.type,
      count: b.count,
      length: b.length,
      percentage: totalRivers > 0 ? (b.count / totalRivers) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
    });

  return {
    total_rivers: totalRivers,
    total_length: totalLength,
    by_type,
  };
}

export interface RiverDistributionRuntime {
  readDistribution(): RiverDistribution | "not-ready";
}

export const defaultRiverDistributionRuntime: RiverDistributionRuntime = {
  readDistribution(): RiverDistribution | "not-ready" {
    return readRiverDistributionFromPack(getPack<RiverDistributionPackLike>());
  },
};

export function createGetRiverDistributionTool(
  runtime: RiverDistributionRuntime = defaultRiverDistributionRuntime,
): Tool {
  return {
    name: "get_river_distribution",
    description:
      'Read aggregate counts and summed length per river type across the current map — the river-level parallel of `get_feature_distribution` / `get_biome_distribution` / `get_state_distribution` / `get_culture_distribution` and an aggregate companion to `list_rivers` / `find_longest_rivers` / `get_river_info`. Iterates `pack.rivers` linearly, skipping the index-0 placeholder and any falsy / `removed: true` entries (same walk `list_rivers` / `find_longest_rivers` use). Each surviving river is bucketed by its effective type: `river.type` when present as a non-empty string (the generator commonly produces `River`, `Stream`, `Creek`, `Brook`, `Fork`, `Branch`, but `set_river_type` accepts free-form labels like `Canal`, `Ravine`, `Ditch`, so any label may appear); otherwise `"unknown"` when the raw river omits `type` or has a non-string / empty-string value. Per group, accumulates `count` and `length` (sum of `river.length`, with missing / non-finite lengths coerced to `0`). `percentage` is each group\'s share of `total_rivers` — `count / total_rivers * 100`, floating, `0` when `total_rivers` is `0`. Also surfaces `total_rivers` (count of non-removed rivers after skipping the placeholder) and `total_length` (summed length across the same set) for a quick summary. Takes no parameters. Returns `{ ok, total_rivers, total_length, by_type }` sorted by `count` descending with ties broken by `type` ascending. When the map has no active rivers, `total_rivers` is `0`, `total_length` is `0`, and `by_type` is `[]`, still `ok: true`. Useful for the "how many streams vs rivers are there?" / "what\'s the waterway makeup?" / "give me a river breakdown" report, quick audits after `set_river_type` / `rename_river` / `remove_river` / `regenerate_river_names`, and sanity checks when comparing two maps\' hydrology. Read-only — never mutates the pack. Errors only on un-generated map (`pack` / `pack.rivers` missing). Requires an Anthropic API key (see \'Getting an API key\' below).',
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

export const getRiverDistributionTool = createGetRiverDistributionTool();
