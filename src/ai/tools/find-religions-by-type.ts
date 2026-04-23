import {
  errorResult,
  getPack,
  okResult,
  type RawCulture,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  RELIGION_TYPES,
  type ReligionType,
  resolveReligionType,
} from "./set-religion-type";

export const DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT = 10000;
export const MAX_FIND_RELIGIONS_BY_TYPE_LIMIT = 100000;

export interface FindReligionsByTypeHit {
  i: number;
  name: string;
  color: string | null;
  form: string | null;
  deity: string | null;
  culture: string | null;
}

export interface FindReligionsByTypePayload {
  type: ReligionType;
  religions: FindReligionsByTypeHit[];
  count: number;
}

export type FindReligionsByTypeResult =
  | FindReligionsByTypePayload
  | "not-ready";

interface PackLike {
  religions?: RawReligion[];
  cultures?: RawCulture[];
}

/**
 * Pure scanner: collects every active religion in `pack.religions` whose
 * `religion.type` matches the requested canonical `ReligionType` (compared
 * case-insensitively against the raw `religion.type` string). Skips the
 * index-0 "No Religion" placeholder and `removed: true` entries. Religions
 * without a string `type` never match. `count` reports the full unlimited
 * total even when `religions` is truncated by `limit`. The per-religion
 * `culture` field is the origin culture's name (looked up via
 * `pack.cultures[religion.culture]`), or `null` when the religion has no
 * culture, `religion.culture === 0` (Wildlands), or the culture is missing
 * or removed.
 */
export function findReligionsByTypeInPack(
  pack: PackLike | undefined,
  type: ReligionType,
  limit: number,
): FindReligionsByTypeResult {
  if (!pack?.religions) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const needle = type.toLowerCase();
  const cultures = pack.cultures ?? [];
  const religions: FindReligionsByTypeHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.religions.length; k++) {
    const r = pack.religions[k];
    if (!r) continue;
    if (r.i === 0) continue;
    if (r.removed) continue;
    if (typeof r.type !== "string") continue;
    if (r.type.toLowerCase() !== needle) continue;

    count++;
    if (religions.length < cap) {
      let cultureName: string | null = null;
      if (typeof r.culture === "number" && r.culture > 0) {
        const culture = cultures[r.culture];
        if (culture && !culture.removed && typeof culture.name === "string") {
          cultureName = culture.name;
        }
      }
      religions.push({
        i: r.i,
        name: typeof r.name === "string" ? r.name : "",
        color: typeof r.color === "string" ? r.color : null,
        form: typeof r.form === "string" ? r.form : null,
        deity: typeof r.deity === "string" ? r.deity : null,
        culture: cultureName,
      });
    }
  }

  return { type, religions, count };
}

export interface FindReligionsByTypeRuntime {
  find(type: ReligionType, limit: number): FindReligionsByTypeResult;
}

export const defaultFindReligionsByTypeRuntime: FindReligionsByTypeRuntime = {
  find(type, limit) {
    return findReligionsByTypeInPack(getPack<PackLike>(), type, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_RELIGIONS_BY_TYPE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_RELIGIONS_BY_TYPE_LIMIT}].`;
  }
  return value;
}

export function createFindReligionsByTypeTool(
  runtime: FindReligionsByTypeRuntime = defaultFindReligionsByTypeRuntime,
): Tool {
  return {
    name: "find_religions_by_type",
    description: `List every active religion whose \`religion.type\` matches a caller-supplied type label — the type-filtered parallel of \`list_religions\` and the bulk counterpart to \`get_religion_info\` / \`set_religion_type\` when you want every religion that shares a type. Required \`type\` (string) is matched case-insensitively against the canonical religion types (${RELIGION_TYPES.join(", ")}) and echoed back in the response in its canonical casing; unknown types are rejected with the supported list. Optional \`limit\` (integer in [1, ${MAX_FIND_RELIGIONS_BY_TYPE_LIMIT}], default ${DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT}) caps the returned \`religions\` array; \`count\` still reports the full unlimited total. Iterates \`pack.religions\` linearly, skipping the index-0 'No Religion' placeholder and any \`removed: true\` religions, and returns \`{ ok, type, religions, count }\` where each religion is \`{ i, name, color, form, deity, culture }\`. \`color\` / \`form\` / \`deity\` fall back to \`null\` when the raw religion omits them. \`culture\` is the origin culture's name (string, via \`pack.cultures[religion.culture]\`) or \`null\` when \`religion.culture === 0\` (Wildlands), the field is missing, or the culture is unavailable or removed. When no religion matches, \`religions\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on un-generated map, missing / non-string / empty \`type\`, unknown \`type\`, or out-of-range \`limit\`. Useful as a first step for bulk religion operations keyed purely by type — audit every Organized religion on the map, feed religion ids into \`get_religion_info\`, or filter candidates for \`rename_religion\` / \`set_religion_color\` / \`set_religion_type\` without any culture filter. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: `Religion type. Case-insensitive match against one of: ${RELIGION_TYPES.join(", ")}.`,
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_RELIGIONS_BY_TYPE_LIMIT,
          description: `Maximum religions to return in the response (default ${DEFAULT_FIND_RELIGIONS_BY_TYPE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown; limit?: unknown };

      if (input.type === undefined || input.type === null) {
        return errorResult("type is required.", {
          supported: [...RELIGION_TYPES],
        });
      }
      if (typeof input.type !== "string") {
        return errorResult("type must be a string.", {
          supported: [...RELIGION_TYPES],
        });
      }
      if (!input.type.trim()) {
        return errorResult("type must be a non-empty string.", {
          supported: [...RELIGION_TYPES],
        });
      }

      const resolved = resolveReligionType(input.type);
      if (!resolved) {
        return errorResult(
          `Unknown religion type: ${JSON.stringify(input.type)}.`,
          { supported: [...RELIGION_TYPES] },
        );
      }

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.find(resolved, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        type: result.type,
        religions: result.religions,
        count: result.count,
      });
    },
  };
}

export const findReligionsByTypeTool = createFindReligionsByTypeTool();
