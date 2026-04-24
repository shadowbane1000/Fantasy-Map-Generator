import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawCulture,
  type RawProvince,
  type RawReligion,
  type RawRiver,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type DuplicateNameDomain =
  | "state"
  | "province"
  | "burg"
  | "culture"
  | "religion"
  | "river";

export const DUPLICATE_NAME_DOMAINS: DuplicateNameDomain[] = [
  "state",
  "province",
  "burg",
  "culture",
  "religion",
  "river",
];

export const DEFAULT_FIND_DUPLICATE_NAMES_LIMIT = 1000;
export const MAX_FIND_DUPLICATE_NAMES_LIMIT = 100000;

interface PackLike {
  states?: RawState[];
  provinces?: RawProvince[];
  burgs?: RawBurg[];
  cultures?: RawCulture[];
  religions?: RawReligion[];
  rivers?: RawRiver[];
}

type Named = { i: number; name?: string; removed?: boolean };

export interface DuplicateNameGroup {
  name: string;
  ids: number[];
  count: number;
}

export interface FindDuplicateNamesPayload {
  domain: DuplicateNameDomain;
  duplicates: DuplicateNameGroup[];
  count: number;
}

export type FindDuplicateNamesResult = FindDuplicateNamesPayload | "not-ready";

function getCollection(
  pack: PackLike,
  domain: DuplicateNameDomain,
): Named[] | undefined {
  switch (domain) {
    case "state":
      return pack.states;
    case "province":
      return pack.provinces;
    case "burg":
      return pack.burgs;
    case "culture":
      return pack.cultures;
    case "religion":
      return pack.religions;
    case "river":
      return pack.rivers;
  }
}

/**
 * Pure scanner: given the world state (`pack`) and a domain, return
 * every group of two or more entities in that collection that share
 * the same name (case-insensitive). Skips the index-0 placeholder and
 * any `removed: true` entry. Entities with missing / empty trimmed
 * names are skipped entirely. Groups are sorted by `count` descending,
 * tie-breaking on lowercased name ascending. `limit` caps the
 * returned `duplicates` array; the full, uncapped group total is
 * reported in `count`.
 *
 * Returns `"not-ready"` when the relevant collection is absent from
 * the pack (e.g. the map hasn't finished generating yet).
 */
export function findDuplicateNamesInPack(
  pack: PackLike | undefined,
  domain: DuplicateNameDomain,
  limit: number,
): FindDuplicateNamesResult {
  if (!pack) return "not-ready";
  const entries = getCollection(pack, domain);
  if (!entries) return "not-ready";

  const buckets = new Map<string, { display: string; ids: number[] }>();
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.removed) continue;
    if (typeof entry.i !== "number" || entry.i <= 0) continue;
    const raw = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!raw) continue;
    const key = raw.toLowerCase();
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.ids.push(entry.i);
    } else {
      buckets.set(key, { display: raw, ids: [entry.i] });
    }
  }

  const groups: DuplicateNameGroup[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.ids.length < 2) continue;
    const ids = bucket.ids.slice().sort((a, b) => a - b);
    groups.push({
      name: bucket.display,
      ids,
      count: ids.length,
    });
  }

  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const total = groups.length;
  const cap = limit > 0 ? limit : 0;
  const duplicates = groups.length > cap ? groups.slice(0, cap) : groups;

  return {
    domain,
    duplicates,
    count: total,
  };
}

export interface FindDuplicateNamesRuntime {
  collect(domain: DuplicateNameDomain, limit: number): FindDuplicateNamesResult;
}

export const defaultFindDuplicateNamesRuntime: FindDuplicateNamesRuntime = {
  collect(domain, limit) {
    return findDuplicateNamesInPack(getPack<PackLike>(), domain, limit);
  },
};

function parseDomain(value: unknown): DuplicateNameDomain | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  for (const d of DUPLICATE_NAME_DOMAINS) {
    if (d === needle) return d;
  }
  return null;
}

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_DUPLICATE_NAMES_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_DUPLICATE_NAMES_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_DUPLICATE_NAMES_LIMIT}].`;
  }
  return value;
}

export function createFindDuplicateNamesTool(
  runtime: FindDuplicateNamesRuntime = defaultFindDuplicateNamesRuntime,
): Tool {
  return {
    name: "find_duplicate_names",
    description:
      "Scan a given entity domain and list every group of two or more entities that share the same name (case-insensitive). Useful for catching typos or unintentional name collisions after bulk rename operations — e.g. spotting two burgs both called 'Rivermeet' or a province that accidentally shares a name with its parent state after a merge. Required `domain` (case-insensitive string, one of 'state', 'province', 'burg', 'culture', 'religion', 'river'). Marker names come from the Notes list rather than the marker record itself, so markers are intentionally NOT supported here — use the notes tools to audit marker labels. Optional `limit` (integer in [1, 100000], default 1000) caps the returned `duplicates` groups; `count` always reports the full uncapped number of groups even when truncated. Algorithm: iterate the chosen collection, skip the index-0 placeholder, any `removed: true` entry, and any entry whose trimmed name is empty; bucket the remaining entries by `name.trim().toLowerCase()`; emit only buckets with size >= 2; sort groups by `count` descending, tie-breaking on lowercased name ascending so the output is deterministic. Each group reports the original-case `name` of the first entity encountered in that bucket, the full list of `ids` (ascending), and the group `count`. Returns `{ok, domain, duplicates: [{name, ids, count}], count}`. Read-only — never mutates pack. Errors on unknown / empty / non-string `domain`, out-of-range `limit`, or an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description:
            "Which entity collection to scan: 'state', 'province', 'burg', 'culture', 'religion', or 'river' (case-insensitive).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_DUPLICATE_NAMES_LIMIT,
          description: `Maximum duplicate groups to return (default ${DEFAULT_FIND_DUPLICATE_NAMES_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["domain"],
    },
    execute(rawInput: unknown): ToolResult {
      const args = (rawInput ?? {}) as {
        domain?: unknown;
        limit?: unknown;
      };

      const domain = parseDomain(args.domain);
      if (!domain) {
        return errorResult(
          `domain must be one of ${DUPLICATE_NAME_DOMAINS.map((d) => `'${d}'`).join(", ")}.`,
        );
      }

      const limit = parseLimit(args.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.collect(domain, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        domain: result.domain,
        duplicates: result.duplicates,
        count: result.count,
      });
    },
  };
}

export const findDuplicateNamesTool = createFindDuplicateNamesTool();
