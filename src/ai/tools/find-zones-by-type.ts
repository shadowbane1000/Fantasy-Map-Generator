import { errorResult, getPack, okResult, type RawZone } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_ZONES_BY_TYPE_LIMIT = 10000;
export const MAX_FIND_ZONES_BY_TYPE_LIMIT = 100000;

export interface FindZonesByTypeHit {
  i: number;
  name: string;
  type: string | null;
  color: string | null;
  cells_count: number;
  hidden: boolean;
}

export interface FindZonesByTypePayload {
  type: string;
  zones: FindZonesByTypeHit[];
  count: number;
}

export interface FindZonesByTypeQuery {
  /**
   * Normalised type filter: a non-empty lowercased, trimmed string
   * matched case-insensitively against `zone.type.trim()`.
   */
  type: string;
  limit: number;
}

export type FindZonesByTypeResult = FindZonesByTypePayload | "not-ready";

interface ZonePackLike {
  zones?: RawZone[];
}

function zoneTypeMatches(z: RawZone, filter: string): boolean {
  if (typeof z.type !== "string") return false;
  return z.type.trim().toLowerCase() === filter;
}

/**
 * Pure scanner: collects every active zone in `pack.zones` whose
 * `type` matches the caller-supplied filter (case-insensitive after
 * trim). Skips `removed: true` entries and null / undefined array
 * slots. Zone ids are non-contiguous and start at 0 — `zone.i === 0`
 * is a real zone (unlike markers / states), so no placeholder is
 * skipped here. `count` reports the full total even when `zones` is
 * truncated by `limit`.
 */
export function findZonesByTypeInPack(
  pack: ZonePackLike | undefined,
  query: FindZonesByTypeQuery,
): FindZonesByTypeResult {
  if (!pack || !pack.zones) return "not-ready";

  const cap = query.limit > 0 ? query.limit : 0;
  const zones: FindZonesByTypeHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.zones.length; k++) {
    const z = pack.zones[k];
    if (!z) continue;
    if (z.removed) continue;
    if (!zoneTypeMatches(z, query.type)) continue;

    count++;
    if (zones.length < cap) {
      zones.push({
        i: z.i,
        name: typeof z.name === "string" ? z.name : "",
        type: typeof z.type === "string" ? z.type : null,
        color: typeof z.color === "string" ? z.color : null,
        cells_count: Array.isArray(z.cells) ? z.cells.length : 0,
        hidden: !!z.hidden,
      });
    }
  }

  return { type: query.type, zones, count };
}

export interface FindZonesByTypeRuntime {
  find(query: FindZonesByTypeQuery): FindZonesByTypeResult;
}

export const defaultFindZonesByTypeRuntime: FindZonesByTypeRuntime = {
  find(query) {
    return findZonesByTypeInPack(getPack<ZonePackLike>(), query);
  },
};

interface ParsedInput {
  query?: FindZonesByTypeQuery;
  error?: string;
}

function parseLimit(raw: unknown): number | string {
  if (raw === undefined || raw === null)
    return DEFAULT_FIND_ZONES_BY_TYPE_LIMIT;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_FIND_ZONES_BY_TYPE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_ZONES_BY_TYPE_LIMIT}].`;
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
  if (trimmed.length === 0) {
    return { error: "type must be a non-empty string." };
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

export function createFindZonesByTypeTool(
  runtime: FindZonesByTypeRuntime = defaultFindZonesByTypeRuntime,
): Tool {
  return {
    name: "find_zones_by_type",
    description: `List every active zone (Zones Editor overlay region — Invasion, Rebels, Crusade, Disease, Proselytism, Disaster, Eruption, Avalanche, Flood, or any free-form custom type) whose \`zone.type\` matches a caller-supplied label — the type-only, unpaginated companion to \`list_zones\` (which paginates and supports the same type filter) and the zone-side parallel of \`find_markers_by_type\`. Required \`type\` (non-empty string) is matched case-insensitively against \`zone.type.trim()\`. Optional \`limit\` (integer in [1, ${MAX_FIND_ZONES_BY_TYPE_LIMIT}], default ${DEFAULT_FIND_ZONES_BY_TYPE_LIMIT}) caps the returned \`zones\` array; \`count\` always reports the full unlimited total. Scans \`pack.zones\` linearly, skipping any \`removed: true\` zones and null array slots — zone ids are non-contiguous and start at 0, so \`zone.i === 0\` is a real zone (not a placeholder) and is included. Returns \`{ ok, type, zones, count }\` where each zone is \`{ i, name, type, color, cells_count, hidden }\` — \`type\` is the original (untrimmed, case-preserved) \`zone.type\` string, \`name\` is echoed (empty string when unset), \`color\` is echoed when a string else \`null\`, \`cells_count\` is the length of the zone's cells array (0 when absent or non-array), and \`hidden\` mirrors \`zone.hidden\`. When no zone matches, \`zones\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on missing map (\`pack\` or \`pack.zones\` not ready), missing / non-string / empty / whitespace-only \`type\`, or out-of-range \`limit\`. Useful as a first step for bulk zone operations keyed by type — audit every Invasion on the map, feed zone ids into \`get_zone_info\`, or filter candidates for \`set_zone_type\` / \`set_zone_color\` / \`set_zone_visibility\` / \`remove_zone\`. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Zone type to filter on. Case-insensitive exact match against `zone.type.trim()`. Common generator values: Invasion, Rebels, Proselytism, Crusade, Disease, Disaster, Eruption, Avalanche, Flood. Must be a non-empty string.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_ZONES_BY_TYPE_LIMIT,
          description: `Maximum zones to return in the response (default ${DEFAULT_FIND_ZONES_BY_TYPE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["type"],
    },
    execute(input: unknown): ToolResult {
      const parsed = parseInput(input);
      if (parsed.error) return errorResult(parsed.error);
      const query = parsed.query as FindZonesByTypeQuery;
      const result = runtime.find(query);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({
        type: result.type,
        zones: result.zones,
        count: result.count,
      });
    },
  };
}

export const findZonesByTypeTool = createFindZonesByTypeTool();
