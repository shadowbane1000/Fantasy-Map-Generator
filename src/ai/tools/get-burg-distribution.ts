import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { BURG_TYPES, type BurgType, resolveBurgType } from "./set-burg-type";

export interface BurgDistributionEntry {
  type: BurgType;
  count: number;
  population: number;
  percentage: number;
}

export interface BurgDistribution {
  total_burgs: number;
  total_population: number;
  by_type: BurgDistributionEntry[];
}

export interface BurgDistributionPackLike {
  burgs?: RawBurg[];
}

export interface BurgDistributionRates {
  populationRate: number;
  urbanization: number;
}

function safeMultiplier(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function numericNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Pure aggregator: given the world state (`pack`) and the display
 * `populationRate` / `urbanization` multipliers, group every active
 * burg by canonical `burg.type` and compute per-group `count`,
 * scaled `population`, and share `percentage` of the total active burg
 * count. Skips the index-0 placeholder and `removed: true` entries.
 * Population scales the raw `burg.population` sum by
 * `populationRate × urbanization` (with the same `rate <= 0 / NaN → 1`
 * fallback `list_burgs` uses) and rounds to an integer. Types are
 * resolved through `resolveBurgType` (case-insensitive canonical
 * lookup); missing / non-canonical / non-string / empty types fall
 * back to the `"Generic"` bucket (matching the engine's de-facto
 * default burg type). `percentage` is `count / total_burgs * 100`
 * (floating, `0` when `total_burgs` is `0`). Returns `"not-ready"`
 * when `pack` / `pack.burgs` is missing.
 */
export function readBurgDistributionFromPack(
  pack: BurgDistributionPackLike | undefined,
  rates: BurgDistributionRates,
): BurgDistribution | "not-ready" {
  if (!pack?.burgs) return "not-ready";

  const rate = safeMultiplier(rates.populationRate);
  const urban = safeMultiplier(rates.urbanization);

  interface Bucket {
    type: BurgType;
    count: number;
    rawPopulation: number;
  }

  // Pre-seed every canonical type so ordering stays stable and the
  // default "Generic" fallback bucket exists up-front.
  const buckets = new Map<BurgType, Bucket>();
  for (const t of BURG_TYPES) {
    buckets.set(t, { type: t, count: 0, rawPopulation: 0 });
  }

  let totalBurgs = 0;

  for (const burg of pack.burgs) {
    if (!burg) continue;
    if (burg.i === 0) continue;
    if (burg.removed) continue;

    const canonical = resolveBurgType(burg.type) ?? "Generic";
    const bucket = buckets.get(canonical);
    if (!bucket) continue;

    bucket.count += 1;
    bucket.rawPopulation += numericNonNegative(burg.population);
    totalBurgs += 1;
  }

  const entries: BurgDistributionEntry[] = [];
  let totalPopulation = 0;

  for (const bucket of buckets.values()) {
    if (bucket.count === 0) continue;
    const population = Math.max(
      0,
      Math.round(bucket.rawPopulation * rate * urban),
    );
    totalPopulation += population;
    entries.push({
      type: bucket.type,
      count: bucket.count,
      population,
      percentage: totalBurgs > 0 ? (bucket.count / totalBurgs) * 100 : 0,
    });
  }

  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });

  return {
    total_burgs: totalBurgs,
    total_population: totalPopulation,
    by_type: entries,
  };
}

export interface BurgDistributionRuntime {
  readDistribution(): BurgDistribution | "not-ready";
}

export const defaultBurgDistributionRuntime: BurgDistributionRuntime = {
  readDistribution(): BurgDistribution | "not-ready" {
    const pack = getPack<BurgDistributionPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    const urbanization = getGlobal<number>("urbanization");
    return readBurgDistributionFromPack(pack, {
      populationRate: typeof populationRate === "number" ? populationRate : 1,
      urbanization: typeof urbanization === "number" ? urbanization : 1,
    });
  },
};

export function createGetBurgDistributionTool(
  runtime: BurgDistributionRuntime = defaultBurgDistributionRuntime,
): Tool {
  return {
    name: "get_burg_distribution",
    description: `Read aggregate counts and scaled population totals per burg type (city / town category) across the current map — the burg-level parallel of \`get_feature_distribution\` / \`get_biome_distribution\` / \`get_state_distribution\` / \`get_culture_distribution\` and an aggregate companion to \`list_burgs\` / \`find_burgs_by_type\` / \`find_largest_burgs\` / \`get_burg_info\`. Iterates \`pack.burgs\` linearly, skipping the index-0 placeholder and any \`removed: true\` burgs (same walk \`list_burgs\` / \`find_burgs_by_type\` use). Each surviving burg is grouped by its canonical \`burg.type\` resolved through the shared \`resolveBurgType\` case-insensitive lookup against ${BURG_TYPES.join(", ")} — so \`"generic"\`, \`"Generic"\`, and \`"GENERIC"\` all land in the same bucket reported as \`"Generic"\`. Burgs whose \`type\` is missing, non-string, empty, or not a canonical value fall back to the \`"Generic"\` bucket (matching the engine's de-facto default burg type where a burg without an explicit classification is treated as Generic). Per group, accumulates \`count\` and \`population\` — the sum of \`burg.population × populationRate × urbanization\` over the group's burgs, rounded to an integer (same \`populationRate × urbanization\` scaling \`list_burgs\` / \`get_population_stats\` apply for display; the \`rate <= 0 / NaN → 1\` fallback is preserved). \`percentage\` is each group's share of \`total_burgs\` — \`count / total_burgs * 100\`, floating, \`0\` when \`total_burgs\` is \`0\`. Takes no parameters. Returns \`{ ok, total_burgs, total_population, by_type }\` sorted by \`count\` descending with ties broken by \`type\` ascending (canonical casing). Empty buckets (canonical types with zero active burgs) are filtered out so the response mirrors what actually exists on the map. When the map has no active burgs, \`total_burgs\` and \`total_population\` are \`0\` and \`by_type\` is \`[]\`, still \`ok: true\`. Useful for the "how are burgs distributed by type?" / "how many Naval vs Highland burgs does this map have?" report, demographic summaries that need per-type urban population counts, sanity checks after bulk \`set_burg_type\` / burg-generator reruns, and feeding category counts into higher-level narrative generation. Read-only — never mutates the pack. Errors only on un-generated map (\`pack\` / \`pack.burgs\` missing). Requires an Anthropic API key (see "Getting an API key" below).`,
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

export const getBurgDistributionTool = createGetBurgDistributionTool();
