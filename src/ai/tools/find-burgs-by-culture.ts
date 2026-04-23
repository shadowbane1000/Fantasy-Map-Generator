import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT = 10000;
export const MAX_FIND_BURGS_BY_CULTURE_LIMIT = 100000;

export interface FindBurgsByCultureHit {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
}

export interface FindBurgsByCulturePayload {
  burgs: FindBurgsByCultureHit[];
  count: number;
}

export type FindBurgsByCultureResult = FindBurgsByCulturePayload | "not-ready";

export interface ResolvedCulture {
  i: number;
  name: string;
}

export type ResolveCultureResult = ResolvedCulture | "not-ready" | "not-found";

interface PackLike {
  burgs?: RawBurg[];
  cultures?: RawCulture[];
}

/**
 * Resolve a culture ref (non-negative numeric id or case-insensitive name)
 * against `pack.cultures`. Cultures differ from states: id 0 (Wildlands) IS
 * valid, and cultures don't carry a `fullName`. Returns the resolved
 * `{ i, name }` or a tagged failure string.
 */
export function resolveCultureRefInPack(
  pack: PackLike | undefined,
  ref: number | string,
): ResolveCultureResult {
  if (!pack?.cultures) return "not-ready";
  const cultures = pack.cultures;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0 || ref >= cultures.length) {
      return "not-found";
    }
    const entry = cultures[ref];
    if (!entry || entry.removed) return "not-found";
    return { i: entry.i, name: entry.name ?? "" };
  }
  if (typeof ref !== "string") return "not-found";
  const needle = ref.trim().toLowerCase();
  if (!needle) return "not-found";
  for (const c of cultures) {
    if (!c || c.removed) continue;
    if ((c.name ?? "").toLowerCase() === needle) {
      return { i: c.i, name: c.name ?? "" };
    }
  }
  return "not-found";
}

/**
 * Pure scanner: collects every active burg in `pack.burgs` whose
 * `burg.culture` matches the requested `cultureI`. Skips the index-0
 * placeholder and `removed: true` entries. `count` reports the full
 * unlimited total even when `burgs` is truncated by `limit`.
 */
export function findBurgsByCultureInPack(
  pack: PackLike | undefined,
  cultureI: number,
  limit: number,
): FindBurgsByCultureResult {
  if (!pack?.burgs) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const burgs: FindBurgsByCultureHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    if (b.culture !== cultureI) continue;

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

  return { burgs, count };
}

export interface FindBurgsByCultureRuntime {
  resolveCulture(ref: number | string): ResolveCultureResult;
  find(cultureI: number, limit: number): FindBurgsByCultureResult;
}

export const defaultFindBurgsByCultureRuntime: FindBurgsByCultureRuntime = {
  resolveCulture(ref) {
    return resolveCultureRefInPack(getPack<PackLike>(), ref);
  },
  find(cultureI, limit) {
    return findBurgsByCultureInPack(getPack<PackLike>(), cultureI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_BURGS_BY_CULTURE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_BURGS_BY_CULTURE_LIMIT}].`;
  }
  return value;
}

function parseCultureRef(
  value: unknown,
): { ok: true; ref: number | string } | { ok: false; error: string } {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return { ok: true, ref: value };
  }
  if (typeof value === "string" && value.trim()) {
    return { ok: true, ref: value };
  }
  return {
    ok: false,
    error:
      "culture must be a non-negative integer id or a non-empty name string.",
  };
}

export function createFindBurgsByCultureTool(
  runtime: FindBurgsByCultureRuntime = defaultFindBurgsByCultureRuntime,
): Tool {
  return {
    name: "find_burgs_by_culture",
    description:
      "List every active burg (city or town) belonging to a given culture — the culture-filtered parallel of `list_burgs` and the bulk counterpart to `get_culture_info` (which only reports `burgs_count`, not the list). Required `culture` identifies the target culture by numeric id (>= 0; id 0 is the Wildlands placeholder and IS allowed, unlike states / burgs) or case-insensitive name. Cultures don't carry `fullName`, so resolution is by `name` only (skips `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `burgs` array; `count` still reports the full unlimited total. Iterates `pack.burgs` linearly, skipping the index-0 placeholder and any `removed: true` burgs, and returns `{ ok, culture, burgs, count }` where `culture` is `{ i, name }` echoing the resolved culture and each burg is `{ i, name, x, y, population, capital }`. Matches on `burg.culture === cultureI` (direct field, the same source `get_burg_info` exposes). `population` is the raw engine value (`burg.population`) — scale by `populationRate × urbanization` like `list_burgs` for display. `capital` is `true` only when `burg.capital === 1`. When the culture has no burgs, `burgs` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, an unresolvable culture ref, missing / invalid `culture`, or out-of-range `limit`. Useful as a first step for bulk burg operations inside a culture — rename every burg, audit capitals / ports (post-filter on `capital`), feed burg ids into `get_burg_info`, or filter candidates for `rename_burg` / `move_burg` / `set_burg_population`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (>= 0; 0 = Wildlands is allowed) or the culture's current name (case-insensitive).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_BURGS_BY_CULTURE_LIMIT,
          description: `Maximum burgs to return in the response (default ${DEFAULT_FIND_BURGS_BY_CULTURE_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { culture?: unknown; limit?: unknown };

      const parsed = parseCultureRef(input.culture);
      if (!parsed.ok) return errorResult(parsed.error);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const resolved = runtime.resolveCulture(parsed.ref);
      if (resolved === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (resolved === "not-found") {
        return errorResult(
          `No culture found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }

      const result = runtime.find(resolved.i, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        culture: { i: resolved.i, name: resolved.name },
        burgs: result.burgs,
        count: result.count,
      });
    },
  };
}

export const findBurgsByCultureTool = createFindBurgsByCultureTool();
