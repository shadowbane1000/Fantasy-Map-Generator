import {
  errorResult,
  getPack,
  okResult,
  type RawBurg,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT = 10000;
export const MAX_FIND_BURGS_BY_RELIGION_LIMIT = 100000;

export interface FindBurgsByReligionHit {
  i: number;
  name: string;
  x: number;
  y: number;
  population: number;
  capital: boolean;
}

export interface FindBurgsByReligionPayload {
  burgs: FindBurgsByReligionHit[];
  count: number;
}

export type FindBurgsByReligionResult =
  | FindBurgsByReligionPayload
  | "not-ready";

export interface ResolvedReligion {
  i: number;
  name: string;
}

export type ResolveReligionResult =
  | ResolvedReligion
  | "not-ready"
  | "not-found";

interface PackLike {
  burgs?: RawBurg[];
  religions?: RawReligion[];
  cells?: {
    religion?: Array<number | undefined> | number[];
  };
}

/**
 * Resolve a religion ref (non-negative numeric id or case-insensitive name)
 * against `pack.religions`. Religion 0 ("No religion") IS valid here, since
 * it groups all burgs sitting on cells without an organized religion.
 * Religions don't carry `fullName`, so resolution is by `name` only.
 * Returns the resolved `{ i, name }` or a tagged failure string.
 */
export function resolveReligionRefInPack(
  pack: PackLike | undefined,
  ref: number | string,
): ResolveReligionResult {
  if (!pack?.religions) return "not-ready";
  const religions = pack.religions;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 0 || ref >= religions.length) {
      return "not-found";
    }
    const entry = religions[ref];
    if (!entry || entry.removed) return "not-found";
    return { i: entry.i, name: entry.name ?? "" };
  }
  if (typeof ref !== "string") return "not-found";
  const needle = ref.trim().toLowerCase();
  if (!needle) return "not-found";
  for (const r of religions) {
    if (!r || r.removed) continue;
    if ((r.name ?? "").toLowerCase() === needle) {
      return { i: r.i, name: r.name ?? "" };
    }
  }
  return "not-found";
}

/**
 * Pure scanner: collects every active burg in `pack.burgs` whose home
 * cell's religion slot (`pack.cells.religion[burg.cell]`) matches the
 * requested `religionI`. Skips the index-0 burg placeholder and
 * `removed: true` entries. `count` reports the full unlimited total
 * even when `burgs` is truncated by `limit`.
 */
export function findBurgsByReligionInPack(
  pack: PackLike | undefined,
  religionI: number,
  limit: number,
): FindBurgsByReligionResult {
  if (!pack?.burgs) return "not-ready";
  const cellReligion = pack.cells?.religion;
  if (!cellReligion) return "not-ready";

  const cap = limit > 0 ? limit : 0;
  const burgs: FindBurgsByReligionHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.burgs.length; k++) {
    const b = pack.burgs[k];
    if (!b) continue;
    if (b.i === 0) continue;
    if (b.removed) continue;
    if (typeof b.cell !== "number") continue;

    const cr = (cellReligion as Array<number | undefined>)[b.cell];
    if (cr !== religionI) continue;

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

export interface FindBurgsByReligionRuntime {
  resolveReligion(ref: number | string): ResolveReligionResult;
  find(religionI: number, limit: number): FindBurgsByReligionResult;
}

export const defaultFindBurgsByReligionRuntime: FindBurgsByReligionRuntime = {
  resolveReligion(ref) {
    return resolveReligionRefInPack(getPack<PackLike>(), ref);
  },
  find(religionI, limit) {
    return findBurgsByReligionInPack(getPack<PackLike>(), religionI, limit);
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_BURGS_BY_RELIGION_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_BURGS_BY_RELIGION_LIMIT}].`;
  }
  return value;
}

function parseReligionRef(
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
      "religion must be a non-negative integer id or a non-empty name string.",
  };
}

export function createFindBurgsByReligionTool(
  runtime: FindBurgsByReligionRuntime = defaultFindBurgsByReligionRuntime,
): Tool {
  return {
    name: "find_burgs_by_religion",
    description:
      "List every active burg (city or town) belonging to a given religion — the religion-filtered parallel of `list_burgs` and the bulk counterpart to `get_religion_info` (which reports `burgs_count` but not the list). Required `religion` identifies the target religion by numeric id (>= 0; id 0 = 'No religion' IS allowed and groups all burgs on cells without an organized religion, unlike `get_religion_info` which rejects 0) or case-insensitive name. Religions don't carry `fullName`, so resolution is by `name` only (skips `removed: true` entries). Optional `limit` (integer in [1, 100000], default 10000) caps the returned `burgs` array; `count` still reports the full unlimited total. Religions are stored per-cell — NOT on the burg — so matching uses the same indirection `get_religion_info` uses for `burgs_count`: for each active burg, compare `pack.cells.religion[burg.cell] === religionI`. Iterates `pack.burgs` linearly, skipping the index-0 placeholder and any `removed: true` burgs, and returns `{ ok, religion, burgs, count }` where `religion` is `{ i, name }` echoing the resolved religion and each burg is `{ i, name, x, y, population, capital }`. `population` is the raw engine value (`burg.population`) — scale by `populationRate × urbanization` like `list_burgs` for display. `capital` is `true` only when `burg.capital === 1`. When the religion has no burgs, `burgs` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map, an unresolvable religion ref, missing / invalid `religion`, or out-of-range `limit`. Useful as a first step for bulk burg operations inside a religion — rename every burg, audit capitals / ports (post-filter on `capital`), feed burg ids into `get_burg_info`, or filter candidates for `rename_burg` / `move_burg` / `set_burg_population`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description:
            "Numeric religion id (>= 0; 0 = 'No religion' is allowed) or the religion's current name (case-insensitive).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_BURGS_BY_RELIGION_LIMIT,
          description: `Maximum burgs to return in the response (default ${DEFAULT_FIND_BURGS_BY_RELIGION_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["religion"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        limit?: unknown;
      };

      const parsed = parseReligionRef(input.religion);
      if (!parsed.ok) return errorResult(parsed.error);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const resolved = runtime.resolveReligion(parsed.ref);
      if (resolved === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (resolved === "not-found") {
        return errorResult(
          `No religion found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }

      const result = runtime.find(resolved.i, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        religion: { i: resolved.i, name: resolved.name },
        burgs: result.burgs,
        count: result.count,
      });
    },
  };
}

export const findBurgsByReligionTool = createFindBurgsByReligionTool();
