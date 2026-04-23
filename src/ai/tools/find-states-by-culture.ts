import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawCulture,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_STATES_BY_CULTURE_LIMIT = 10000;
export const MAX_FIND_STATES_BY_CULTURE_LIMIT = 100000;

export interface FindStatesByCultureHit {
  i: number;
  name: string;
  fullName: string | null;
  form: string | null;
  color: string | null;
  capital: string | null;
}

export interface FindStatesByCulturePayload {
  states: FindStatesByCultureHit[];
  count: number;
}

export type FindStatesByCultureResult =
  | FindStatesByCulturePayload
  | "not-ready";

export interface ResolvedCulture {
  i: number;
  name: string;
}

export type ResolveCultureResult = ResolvedCulture | "not-ready" | "not-found";

interface PackLike {
  states?: RawState[];
  cultures?: RawCulture[];
  burgs?: RawBurg[];
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
 * Pure scanner: collects every active state in `pack.states` whose
 * `state.culture` matches the requested `cultureI`. Skips the Neutrals
 * placeholder at index 0 and any `removed: true` entries. `count`
 * reports the full unlimited total even when `states` is truncated by
 * `limit`. The per-state `capital` field is the capital burg's name
 * (looked up via `pack.burgs[state.capital]`), or `null` when the
 * state has no capital or the burg is missing.
 */
export function findStatesByCultureInPack(
  pack: PackLike | undefined,
  cultureI: number,
  limit: number,
): FindStatesByCultureResult {
  if (!pack?.states) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const burgs = pack.burgs ?? [];
  const states: FindStatesByCultureHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.states.length; k++) {
    const s = pack.states[k];
    if (!s) continue;
    if (s.i === 0) continue;
    if (s.removed) continue;
    if (s.culture !== cultureI) continue;

    count++;
    if (states.length < cap) {
      let capitalName: string | null = null;
      if (typeof s.capital === "number" && s.capital > 0) {
        const burg = burgs[s.capital];
        capitalName = burg && typeof burg.name === "string" ? burg.name : null;
      }
      states.push({
        i: s.i,
        name: typeof s.name === "string" ? s.name : "",
        fullName: typeof s.fullName === "string" ? s.fullName : null,
        form: typeof s.form === "string" ? s.form : null,
        color: typeof s.color === "string" ? s.color : null,
        capital: capitalName,
      });
    }
  }

  return { states, count };
}

export interface FindStatesByCultureRuntime {
  resolveCulture(ref: number | string): ResolveCultureResult;
  find(cultureI: number, limit: number): FindStatesByCultureResult;
}

export const defaultFindStatesByCultureRuntime: FindStatesByCultureRuntime = {
  resolveCulture(ref) {
    return resolveCultureRefInPack(getPack<PackLike>(), ref);
  },
  find(cultureI, limit) {
    return findStatesByCultureInPack(getPack<PackLike>(), cultureI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_STATES_BY_CULTURE_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_STATES_BY_CULTURE_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_STATES_BY_CULTURE_LIMIT}].`;
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

export function createFindStatesByCultureTool(
  runtime: FindStatesByCultureRuntime = defaultFindStatesByCultureRuntime,
): Tool {
  return {
    name: "find_states_by_culture",
    description:
      "List every active state whose dominant culture is a given culture — the culture-filtered parallel of `list_states` and the bulk counterpart to `get_culture_info` (which only reports `states_count`, not the list). Required `culture` identifies the target culture by numeric id (>= 0; id 0 is the Wildlands placeholder and IS allowed, unlike states / burgs) or case-insensitive name. Cultures don't carry `fullName`, so resolution is by `name` only (skips `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `states` array; `count` still reports the full unlimited total. Iterates `pack.states` linearly, skipping the index-0 Neutrals placeholder and any `removed: true` states, and returns `{ ok, culture, states, count }` where `culture` is `{ i, name }` echoing the resolved culture and each state is `{ i, name, fullName, form, color, capital }`. Matches on `state.culture === cultureI` (direct field, the same source `get_culture_info` uses for its `states_count` scan). `fullName` / `form` / `color` fall back to `null` when the raw state omits them. `capital` is the capital burg's name (string, via `pack.burgs[state.capital]`) or `null` when `state.capital === 0` or the burg is unavailable — the same shape `list_states` exposes. When the culture has no states, `states` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, an unresolvable culture ref, missing / invalid `culture`, or out-of-range `limit`. Useful as a first step for bulk state operations inside a culture — rename every state, audit capitals, feed state ids into `get_state_info`, or filter candidates for `rename_state` / `set_state_color` / other state editors. Requires an Anthropic API key (see 'Getting an API key' below).",
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
          maximum: MAX_FIND_STATES_BY_CULTURE_LIMIT,
          description: `Maximum states to return in the response (default ${DEFAULT_FIND_STATES_BY_CULTURE_LIMIT}). \`count\` still reports the full unlimited total.`,
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
        states: result.states,
        count: result.count,
      });
    },
  };
}

export const findStatesByCultureTool = createFindStatesByCultureTool();
