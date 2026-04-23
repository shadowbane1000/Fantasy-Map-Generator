import {
  errorResult,
  getPack,
  okResult,
  type RawCulture,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT = 10000;
export const MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT = 100000;

export interface FindReligionsByCultureHit {
  i: number;
  name: string;
  type: string | null;
  form: string | null;
  color: string | null;
  deity: string | null;
}

export interface FindReligionsByCulturePayload {
  religions: FindReligionsByCultureHit[];
  count: number;
}

export type FindReligionsByCultureResult =
  | FindReligionsByCulturePayload
  | "not-ready";

export interface ResolvedCulture {
  i: number;
  name: string;
}

export type ResolveCultureResult = ResolvedCulture | "not-ready" | "not-found";

interface PackLike {
  religions?: RawReligion[];
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
 * Pure scanner: collects every active religion in `pack.religions` whose
 * `religion.culture` matches the requested `cultureI`. Skips the
 * "No religion" placeholder at index 0 and any `removed: true` entries.
 * `count` reports the full unlimited total even when `religions` is
 * truncated by `limit`.
 */
export function findReligionsByCultureInPack(
  pack: PackLike | undefined,
  cultureI: number,
  limit: number,
): FindReligionsByCultureResult {
  if (!pack?.religions) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const religions: FindReligionsByCultureHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.religions.length; k++) {
    const r = pack.religions[k];
    if (!r) continue;
    if (r.i === 0) continue;
    if (r.removed) continue;
    if (r.culture !== cultureI) continue;

    count++;
    if (religions.length < cap) {
      religions.push({
        i: r.i,
        name: typeof r.name === "string" ? r.name : "",
        type: typeof r.type === "string" ? r.type : null,
        form: typeof r.form === "string" ? r.form : null,
        color: typeof r.color === "string" ? r.color : null,
        deity: typeof r.deity === "string" ? r.deity : null,
      });
    }
  }

  return { religions, count };
}

export interface FindReligionsByCultureRuntime {
  resolveCulture(ref: number | string): ResolveCultureResult;
  find(cultureI: number, limit: number): FindReligionsByCultureResult;
}

export const defaultFindReligionsByCultureRuntime: FindReligionsByCultureRuntime =
  {
    resolveCulture(ref) {
      return resolveCultureRefInPack(getPack<PackLike>(), ref);
    },
    find(cultureI, limit) {
      return findReligionsByCultureInPack(getPack<PackLike>(), cultureI, limit);
    },
  };

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT}].`;
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

export function createFindReligionsByCultureTool(
  runtime: FindReligionsByCultureRuntime = defaultFindReligionsByCultureRuntime,
): Tool {
  return {
    name: "find_religions_by_culture",
    description:
      "List every active religion whose origin culture is a given culture — the culture-filtered parallel of `list_religions` and the bulk counterpart to `get_culture_info` / `get_religion_info` (each religion records its origin culture via `religion.culture`, but there's no bulk lookup otherwise). Required `culture` identifies the target culture by numeric id (>= 0; id 0 is the Wildlands placeholder and IS allowed, unlike states / burgs) or case-insensitive name. Cultures don't carry `fullName`, so resolution is by `name` only (skips `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `religions` array; `count` still reports the full unlimited total. Iterates `pack.religions` linearly, skipping the index-0 'No religion' placeholder and any `removed: true` religions, and returns `{ ok, culture, religions, count }` where `culture` is `{ i, name }` echoing the resolved culture and each religion is `{ i, name, type, form, color, deity }`. Matches on `religion.culture === cultureI` (direct field, the same source `get_religion_info` surfaces as its `culture` ref). `type` / `form` / `color` / `deity` fall back to `null` when the raw religion omits them. When the culture has no religions, `religions` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, an unresolvable culture ref, missing / invalid `culture`, or out-of-range `limit`. Useful as a first step for bulk religion operations inside a culture — audit which religions sprang from a culture, feed religion ids into `get_religion_info`, or filter candidates for `rename_religion` / `set_religion_color` / other religion editors. Requires an Anthropic API key (see 'Getting an API key' below).",
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
          maximum: MAX_FIND_RELIGIONS_BY_CULTURE_LIMIT,
          description: `Maximum religions to return in the response (default ${DEFAULT_FIND_RELIGIONS_BY_CULTURE_LIMIT}). \`count\` still reports the full unlimited total.`,
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
        religions: result.religions,
        count: result.count,
      });
    },
  };
}

export const findReligionsByCultureTool = createFindReligionsByCultureTool();
