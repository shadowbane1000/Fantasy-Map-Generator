import { errorResult, getPack, okResult, type RawBurg } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { BURG_TYPES, type BurgType, resolveBurgType } from "./set-burg-type";

export const DEFAULT_FIND_BURGS_BY_TYPE_LIMIT = 10000;
export const MAX_FIND_BURGS_BY_TYPE_LIMIT = 100000;

export interface FindBurgsByTypeHit {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
}

export interface FindBurgsByTypePayload {
  type: BurgType;
  burgs: FindBurgsByTypeHit[];
  count: number;
}

export type FindBurgsByTypeResult = FindBurgsByTypePayload | "not-ready";

interface PackLike {
  burgs?: RawBurg[];
}

/**
 * Pure scanner: collects every active burg in `pack.burgs` whose
 * `burg.type` matches the requested canonical `BurgType` (compared
 * case-insensitively against the raw `burg.type` string). Skips the
 * index-0 placeholder and `removed: true` entries. `count` reports the
 * full unlimited total even when `burgs` is truncated by `limit`.
 */
export function findBurgsByTypeInPack(
  pack: PackLike | undefined,
  type: BurgType,
  limit: number,
): FindBurgsByTypeResult {
  if (!pack?.burgs) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const needle = type.toLowerCase();
  const burgs: FindBurgsByTypeHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    if (typeof b.type !== "string") continue;
    if (b.type.toLowerCase() !== needle) continue;

    count++;
    if (burgs.length < cap) {
      burgs.push({
        i: b.i,
        name: typeof b.name === "string" ? b.name : "",
        x: typeof b.x === "number" ? b.x : 0,
        y: typeof b.y === "number" ? b.y : 0,
        population: typeof b.population === "number" ? b.population : 0,
        capital: b.capital === 1,
      });
    }
  }

  return { type, burgs, count };
}

export interface FindBurgsByTypeRuntime {
  find(type: BurgType, limit: number): FindBurgsByTypeResult;
}

export const defaultFindBurgsByTypeRuntime: FindBurgsByTypeRuntime = {
  find(type, limit) {
    return findBurgsByTypeInPack(getPack<PackLike>(), type, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_BURGS_BY_TYPE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_BURGS_BY_TYPE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_BURGS_BY_TYPE_LIMIT}].`;
  }
  return value;
}

export function createFindBurgsByTypeTool(
  runtime: FindBurgsByTypeRuntime = defaultFindBurgsByTypeRuntime,
): Tool {
  return {
    name: "find_burgs_by_type",
    description: `List every active burg (city or town) whose \`burg.type\` matches a caller-supplied type label — the type-filtered parallel of \`list_burgs\` and the bulk counterpart to \`get_burg_info\` / \`set_burg_type\` when you want every burg that shares a type. Required \`type\` (string) is matched case-insensitively against the canonical burg types (${BURG_TYPES.join(", ")}) and echoed back in the response in its canonical casing; unknown types are rejected with the supported list. Optional \`limit\` (integer in [1, ${MAX_FIND_BURGS_BY_TYPE_LIMIT}], default ${DEFAULT_FIND_BURGS_BY_TYPE_LIMIT}) caps the returned \`burgs\` array; \`count\` still reports the full unlimited total. Iterates \`pack.burgs\` linearly, skipping the index-0 placeholder and any \`removed: true\` burgs, and returns \`{ ok, type, burgs, count }\` where each burg is \`{ i, name, x, y, population, capital }\`. \`population\` is the raw engine value (\`burg.population\`) — scale by \`populationRate × urbanization\` like \`list_burgs\` for display. \`capital\` is \`true\` only when \`burg.capital === 1\`. When no burg matches, \`burgs\` is \`[]\` and \`count\` is \`0\` — still \`ok: true\`. Errors on un-generated map, missing / non-string / empty \`type\`, unknown \`type\`, or out-of-range \`limit\`. Useful as a first step for bulk burg operations keyed purely by type — audit every Naval burg on the map, feed burg ids into \`get_burg_info\`, or filter candidates for \`rename_burg\` / \`move_burg\` / \`set_burg_population\` / \`set_burg_type\` without any state / culture / religion filter. Requires an Anthropic API key (see "Getting an API key" below).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: `Burg type. Case-insensitive match against one of: ${BURG_TYPES.join(", ")}.`,
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_BURGS_BY_TYPE_LIMIT,
          description: `Maximum burgs to return in the response (default ${DEFAULT_FIND_BURGS_BY_TYPE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown; limit?: unknown };

      if (input.type === undefined || input.type === null) {
        return errorResult("type is required.", { supported: [...BURG_TYPES] });
      }
      if (typeof input.type !== "string") {
        return errorResult("type must be a string.", {
          supported: [...BURG_TYPES],
        });
      }
      if (!input.type.trim()) {
        return errorResult("type must be a non-empty string.", {
          supported: [...BURG_TYPES],
        });
      }

      const resolved = resolveBurgType(input.type);
      if (!resolved) {
        return errorResult(
          `Unknown burg type: ${JSON.stringify(input.type)}.`,
          { supported: [...BURG_TYPES] },
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
        burgs: result.burgs,
        count: result.count,
      });
    },
  };
}

export const findBurgsByTypeTool = createFindBurgsByTypeTool();
