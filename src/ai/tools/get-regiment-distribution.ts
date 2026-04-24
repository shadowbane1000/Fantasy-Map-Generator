import {
  errorResult,
  getPack,
  isActive,
  okResult,
  type RawRegiment,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Sentinel bucket label used when a regiment's `type` is missing, not
 * a string, or empty / whitespace-only after trimming. Intentionally
 * lower-case to avoid colliding with generator-emitted types (which
 * the military generator commonly emits verbatim — "melee", "ranged",
 * "cavalry", "fleet", etc. — plus any user-defined custom types).
 */
export const UNTYPED_REGIMENT_BUCKET = "untyped";

export interface RegimentDistributionEntry {
  type: string;
  count: number;
  soldiers: number;
  percentage: number;
}

export interface RegimentDistribution {
  total_regiments: number;
  total_soldiers: number;
  by_type: RegimentDistributionEntry[];
}

export interface RegimentDistributionPackLike {
  states?: RawState[];
}

function numericNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Pure aggregator: given the world state (`pack`), iterate every
 * active state in `pack.states` (skipping the index-0 Neutrals
 * placeholder and `removed: true` states via `isActive`), walk each
 * state's `military` array, and group every valid regiment by its
 * `regiment.type` string. Computes per-group `count`, summed
 * `soldiers` (the sum of `regiment.t`), and share `percentage` of the
 * total active regiment count. Types are grouped by their original
 * (trimmed, case-preserved) string value — no canonicalization is
 * applied. Regiments whose `type` is missing, non-string, empty, or
 * whitespace-only fall back to the `"untyped"` bucket. Regiments
 * without a numeric `i` are skipped as malformed (matches the walk
 * `list_regiments` / `find_regiments_by_type` use). Missing or
 * non-finite `regiment.t` contributes `0` to the soldiers sum.
 * `percentage` is `count / total_regiments * 100` (floating, `0` when
 * `total_regiments` is `0`). Returns `"not-ready"` when `pack` /
 * `pack.states` is missing.
 */
export function readRegimentDistributionFromPack(
  pack: RegimentDistributionPackLike | undefined,
): RegimentDistribution | "not-ready" {
  if (!pack?.states) return "not-ready";

  interface Bucket {
    type: string;
    count: number;
    soldiers: number;
  }

  const buckets = new Map<string, Bucket>();
  let totalRegiments = 0;
  let totalSoldiers = 0;

  for (const state of pack.states) {
    if (!isActive(state)) continue;
    const military = state.military;
    if (!Array.isArray(military) || military.length === 0) continue;

    for (const r of military as (RawRegiment | undefined | null)[]) {
      if (!r) continue;
      if (typeof r.i !== "number") continue;

      let key: string;
      if (typeof r.type === "string") {
        const trimmed = r.type.trim();
        key = trimmed.length === 0 ? UNTYPED_REGIMENT_BUCKET : trimmed;
      } else {
        key = UNTYPED_REGIMENT_BUCKET;
      }

      const soldiers = numericNonNegative(r.t);

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { type: key, count: 0, soldiers: 0 };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      bucket.soldiers += soldiers;
      totalRegiments += 1;
      totalSoldiers += soldiers;
    }
  }

  const entries: RegimentDistributionEntry[] = [];
  for (const bucket of buckets.values()) {
    entries.push({
      type: bucket.type,
      count: bucket.count,
      soldiers: bucket.soldiers,
      percentage:
        totalRegiments > 0 ? (bucket.count / totalRegiments) * 100 : 0,
    });
  }

  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });

  return {
    total_regiments: totalRegiments,
    total_soldiers: totalSoldiers,
    by_type: entries,
  };
}

export interface RegimentDistributionRuntime {
  readDistribution(): RegimentDistribution | "not-ready";
}

export const defaultRegimentDistributionRuntime: RegimentDistributionRuntime = {
  readDistribution(): RegimentDistribution | "not-ready" {
    return readRegimentDistributionFromPack(
      getPack<RegimentDistributionPackLike>(),
    );
  },
};

export function createGetRegimentDistributionTool(
  runtime: RegimentDistributionRuntime = defaultRegimentDistributionRuntime,
): Tool {
  return {
    name: "get_regiment_distribution",
    description: `Read aggregate counts and summed troop totals per regiment type across every state on the current map — the regiment-level parallel of \`get_burg_distribution\` / \`get_marker_distribution\` / \`get_zone_distribution\` / \`get_river_distribution\` and the aggregate companion to \`list_regiments\` / \`find_regiments_by_type\` / \`find_regiments_by_state\` / \`get_regiment_info\`. Regiments live NESTED under \`pack.states[stateI].military[]\` — there is no flat \`pack.regiments\` array — so this tool iterates every active state (skipping the index-0 Neutrals placeholder and any \`removed: true\` states) and every regiment inside each one (skipping falsy entries and malformed regiments without a numeric \`i\`). Each surviving regiment is grouped by its \`regiment.type\` string (trimmed, case-preserved — no canonicalization, so \`"melee"\` and \`"Melee"\` are kept as separate buckets reflecting the actual data on the map; regiment types are arbitrary strings like cultures — unlike states / burgs / religions which gate on a canonical set). Regiments whose \`type\` is missing, non-string, empty, or whitespace-only are bucketed under the sentinel label \`"untyped"\` (lower-case on purpose so it never collides with generator-emitted types like melee / ranged / cavalry / mounted / machinery / naval / armored / aviation / magical / fleet or any user-defined custom type). Per group, accumulates \`count\` (number of regiments) and \`soldiers\` (sum of \`regiment.t\` — total troops — with missing / non-finite / negative \`t\` coerced to \`0\`). \`percentage\` is each group's share of \`total_regiments\` — \`count / total_regiments * 100\`, floating, \`0\` when \`total_regiments\` is \`0\`. Takes no parameters. Returns \`{ ok, total_regiments, total_soldiers, by_type }\` sorted by \`count\` descending with ties broken by \`type\` ascending (lexicographic, case-sensitive because types are case-preserved). When the map has no active regiments (all states have no \`military\` arrays or all military arrays are empty), \`total_regiments\` and \`total_soldiers\` are \`0\` and \`by_type\` is \`[]\`, still \`ok: true\`. Useful for the "how are regiments distributed by type?" / "how many cavalry vs fleet regiments does this map have?" / "what share of soldiers are in melee regiments?" report, military-inventory audits after bulk \`set_regiment_unit\` / \`split_regiment\` / \`remove_regiment\` / \`regenerate_regiment_names\` edits, and feeding per-type counts into higher-level narrative generation. Read-only — never mutates the pack. Errors only on un-generated map (\`pack\` / \`pack.states\` missing). Requires an Anthropic API key (see "Getting an API key" below).`,
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

export const getRegimentDistributionTool = createGetRegimentDistributionTool();
