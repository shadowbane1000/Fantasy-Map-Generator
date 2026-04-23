import { errorResult, getPack, okResult, type RawCulture } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { CULTURE_TYPES } from "./set-culture-type";

export const DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT = 10000;
export const MAX_FIND_CULTURES_BY_TYPE_LIMIT = 100000;

export interface FindCulturesByTypeHit {
  i: number;
  name: string;
  color: string | null;
  expansionism: number | null;
  base: number | null;
  center: number | null;
}

export interface FindCulturesByTypePayload {
  type: string;
  cultures: FindCulturesByTypeHit[];
  count: number;
}

export type FindCulturesByTypeResult = FindCulturesByTypePayload | "not-ready";

interface PackLike {
  cultures?: RawCulture[];
}

/**
 * Pure scanner: collects every non-removed culture in `pack.cultures`
 * whose `culture.type` matches `type` (case-insensitive string compare).
 * Unlike state / burg finders, culture 0 (Wildlands) is NOT filtered out —
 * if its type somehow matches, it's returned. The only skip is
 * `removed: true`. Cultures without a string `type` field never match.
 * `count` reports the full unlimited total even when `cultures` is
 * truncated by `limit`.
 */
export function findCulturesByTypeInPack(
  pack: PackLike | undefined,
  type: string,
  limit: number,
): FindCulturesByTypeResult {
  if (!pack?.cultures) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const needle = type.toLowerCase();
  const cultures: FindCulturesByTypeHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.cultures.length; k++) {
    const c = pack.cultures[k];
    if (!c) continue;
    if (c.removed) continue;
    if (typeof c.type !== "string") continue;
    if (c.type.toLowerCase() !== needle) continue;

    count++;
    if (cultures.length < cap) {
      cultures.push({
        i: c.i,
        name: typeof c.name === "string" ? c.name : "",
        color: typeof c.color === "string" ? c.color : null,
        expansionism:
          typeof c.expansionism === "number" ? c.expansionism : null,
        base: typeof c.base === "number" ? c.base : null,
        center: typeof c.center === "number" ? c.center : null,
      });
    }
  }

  return { type, cultures, count };
}

export interface FindCulturesByTypeRuntime {
  find(type: string, limit: number): FindCulturesByTypeResult;
}

export const defaultFindCulturesByTypeRuntime: FindCulturesByTypeRuntime = {
  find(type, limit) {
    return findCulturesByTypeInPack(getPack<PackLike>(), type, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_CULTURES_BY_TYPE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_CULTURES_BY_TYPE_LIMIT}].`;
  }
  return value;
}

export function createFindCulturesByTypeTool(
  runtime: FindCulturesByTypeRuntime = defaultFindCulturesByTypeRuntime,
): Tool {
  return {
    name: "find_cultures_by_type",
    description: `List every non-removed culture whose \`culture.type\` matches a caller-supplied type label — the type-filtered parallel of \`list_cultures\` and the bulk counterpart to \`set_culture_type\` / \`get_culture_info\` when you want every culture that shares a type. Required \`type\` (string) is matched case-insensitively against the raw \`culture.type\` string (canonical types: ${CULTURE_TYPES.join(", ")}, but ANY string is accepted since cultures may carry arbitrary / legacy types from imports or custom edits — unlike \`find_burgs_by_type\` which rejects non-canonical types); the caller's type is echoed back (trimmed) in the response. Optional \`limit\` (integer in [1, ${MAX_FIND_CULTURES_BY_TYPE_LIMIT}], default ${DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT}) caps the returned \`cultures\` array; \`count\` still reports the full unlimited total. Iterates \`pack.cultures\` linearly, skipping \`removed: true\` entries — note culture 0 (Wildlands) is NOT pre-filtered here: if its type happens to match the caller input it's returned (in practice Wildlands usually has \`type === ""\` so most non-empty queries won't include it). Cultures without a string \`type\` field never match. Returns \`{ ok, type, cultures, count }\` where each culture is \`{ i, name, color, expansionism, base, center }\`. \`color\` falls back to \`null\` when missing; \`expansionism\` / \`base\` / \`center\` fall back to \`null\` when the raw numeric field is missing. When no culture matches, \`cultures\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on un-generated map, missing / non-string / empty \`type\`, or out-of-range \`limit\`. Useful as a first step for bulk culture operations keyed purely by type — audit every Naval culture on the map, feed culture ids into \`get_culture_info\`, or filter candidates for \`rename_culture\` / \`set_culture_color\` / \`set_culture_type\` without any other filter. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: `Culture type. Case-insensitive string compare against \`culture.type\`. Canonical types: ${CULTURE_TYPES.join(", ")} — but any string is accepted, since raw cultures may carry arbitrary type strings.`,
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_CULTURES_BY_TYPE_LIMIT,
          description: `Maximum cultures to return in the response (default ${DEFAULT_FIND_CULTURES_BY_TYPE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown; limit?: unknown };

      if (input.type === undefined || input.type === null) {
        return errorResult("type is required.", {
          supported: [...CULTURE_TYPES],
        });
      }
      if (typeof input.type !== "string") {
        return errorResult("type must be a string.", {
          supported: [...CULTURE_TYPES],
        });
      }
      const trimmed = input.type.trim();
      if (!trimmed) {
        return errorResult("type must be a non-empty string.", {
          supported: [...CULTURE_TYPES],
        });
      }

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const result = runtime.find(trimmed, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        type: result.type,
        cultures: result.cultures,
        count: result.count,
      });
    },
  };
}

export const findCulturesByTypeTool = createFindCulturesByTypeTool();
