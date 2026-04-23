import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRiverByRef } from "./rename-river";

export const DEFAULT_FIND_RIVERS_BY_BASIN_LIMIT = 10000;
export const MAX_FIND_RIVERS_BY_BASIN_LIMIT = 100000;

export interface FindRiversByBasinHit {
  i: number;
  name: string;
  type: string | null;
  parent: number;
  source: number;
  mouth: number;
  length: number;
  discharge: number;
}

export interface FindRiversByBasinBasinRef {
  i: number;
  name: string;
}

export interface FindRiversByBasinPayload {
  basin: FindRiversByBasinBasinRef;
  rivers: FindRiversByBasinHit[];
  count: number;
}

export type FindRiversByBasinResult = FindRiversByBasinPayload | "not-ready";

export type ResolveBasinResult =
  | FindRiversByBasinBasinRef
  | "not-ready"
  | "not-found";

interface PackLike {
  rivers?: RawRiver[];
}

/**
 * Resolve a basin ref (numeric river id or case-insensitive river name)
 * against `pack.rivers` using the shared `findRiverByRef` — identical
 * resolution behaviour to `get_river_info` / `rename_river`. Basins
 * themselves are rivers (by convention, the root of a drainage tree
 * where `river.basin === river.i`), so the ref semantics are just
 * river-ref semantics.
 */
export function resolveBasinRefInPack(
  pack: PackLike | undefined,
  ref: number | string,
): ResolveBasinResult {
  if (!pack?.rivers) return "not-ready";
  const entry = findRiverByRef(pack.rivers, ref);
  if (!entry) return "not-found";
  if (entry.i <= 0) return "not-found";
  return { i: entry.i, name: entry.name ?? "" };
}

/**
 * Pure scanner: collects every active river in `pack.rivers` whose
 * `basin` matches the requested `basinI`. Skips the index-0 placeholder
 * and any `removed: true` entries. When `includeSelf` is true the
 * basin root river itself is also included (matched by `river.i ===
 * basinI`) even if its own `basin` field is unset — the generator
 * doesn't always self-reference. `count` reports the full unlimited
 * total even when `rivers` is truncated by `limit`.
 */
export function findRiversByBasinInPack(
  pack: PackLike | undefined,
  basinI: number,
  includeSelf: boolean,
  limit: number,
): FindRiversByBasinResult {
  if (!pack?.rivers) return "not-ready";

  // We need to echo the basin name from the current pack even on the
  // pure path so callers don't have to re-resolve separately. Look it
  // up once.
  let basinName = "";
  for (const r of pack.rivers) {
    if (!r || r.removed) continue;
    if (r.i === basinI) {
      basinName = r.name ?? "";
      break;
    }
  }

  const cap = limit > 0 ? limit : 0;
  const rivers: FindRiversByBasinHit[] = [];
  let count = 0;

  for (let k = 0; k < pack.rivers.length; k++) {
    const r = pack.rivers[k];
    if (!r) continue;
    if (r.i === 0) continue;
    if (r.removed) continue;

    const isSelf = r.i === basinI;
    const matchesBasin = r.basin === basinI;

    if (isSelf) {
      if (!includeSelf) continue;
    } else if (!matchesBasin) {
      continue;
    }

    count++;
    if (rivers.length < cap) {
      rivers.push({
        i: r.i,
        name: typeof r.name === "string" ? r.name : "",
        type: typeof r.type === "string" ? r.type : null,
        parent: typeof r.parent === "number" ? r.parent : 0,
        source: typeof r.source === "number" ? r.source : 0,
        mouth: typeof r.mouth === "number" ? r.mouth : 0,
        length: typeof r.length === "number" ? r.length : 0,
        discharge: typeof r.discharge === "number" ? r.discharge : 0,
      });
    }
  }

  return {
    basin: { i: basinI, name: basinName },
    rivers,
    count,
  };
}

export interface FindRiversByBasinRuntime {
  resolveBasin(ref: number | string): ResolveBasinResult;
  find(
    basinI: number,
    includeSelf: boolean,
    limit: number,
  ): FindRiversByBasinResult;
}

export const defaultFindRiversByBasinRuntime: FindRiversByBasinRuntime = {
  resolveBasin(ref) {
    return resolveBasinRefInPack(getPack<PackLike>(), ref);
  },
  find(basinI, includeSelf, limit) {
    return findRiversByBasinInPack(
      getPack<PackLike>(),
      basinI,
      includeSelf,
      limit,
    );
  },
};

function parseLimit(value: unknown): number | string {
  if (value === undefined || value === null) {
    return DEFAULT_FIND_RIVERS_BY_BASIN_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_FIND_RIVERS_BY_BASIN_LIMIT
  ) {
    return `limit must be an integer in [1, ${MAX_FIND_RIVERS_BY_BASIN_LIMIT}].`;
  }
  return value;
}

function parseIncludeSelf(value: unknown): boolean | string {
  if (value === undefined || value === null) return true;
  if (typeof value !== "boolean") {
    return "include_self must be a boolean.";
  }
  return value;
}

export function createFindRiversByBasinTool(
  runtime: FindRiversByBasinRuntime = defaultFindRiversByBasinRuntime,
): Tool {
  return {
    name: "find_rivers_by_basin",
    description:
      "List every active river that shares a given drainage basin on the current map — the watershed-audit parallel to `list_rivers` (which has a `basin` filter but is paginated) and the river parallel of `find_provinces_by_state` / `find_burgs_by_state`. A basin IS itself a river (by convention, the root river of a drainage tree where `river.basin === river.i`), so the required `basin` argument is a river ref: numeric river id (matches `river.i`, not array index — ids are non-contiguous because the generator skips removed rivers) OR the river's current case-insensitive name, resolved via the shared `findRiverByRef` (skips removed rivers). Optional `include_self` (boolean, default `true`) controls whether the basin root river itself appears in the `rivers` array — turn off for a pure tributary list. Optional `limit` (integer in [1, 100000], default 10000) caps the returned `rivers` array so large basins don't blow up the response; `count` still reports the full unlimited total. Scans `pack.rivers` linearly, skipping the index-0 placeholder and any `removed: true` entries, and matches rivers by `river.basin === basinI` (plus the root river when `include_self` — the generator doesn't always self-reference, so matching by `river.i === basinI` is what catches it). Returns `{ ok, basin: {i, name}, rivers, count }` where each river is `{ i, name, type, parent, source, mouth, length, discharge }`. When the basin has no tributaries and `include_self=false`, `rivers` is `[]` and `count` is `0` — still `ok: true`. Errors on missing map, a missing / invalid `basin`, an unresolvable or removed basin ref, bad `include_self`, or out-of-range `limit`. Useful as a first step for watershed operations — feed river ids into `get_river_info`, rename every river in a drainage, or filter candidates for `rename_river` / `set_river_type` / `set_river_width` / `remove_river` / `regenerate_river_names`. Read-only. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        basin: {
          type: ["integer", "string"],
          description:
            "Numeric river id (matches `river.i`, not array index) or the basin root river's current case-insensitive name. A basin is itself a river, so this is just a river ref.",
        },
        include_self: {
          type: "boolean",
          description:
            "Include the basin root river itself in the `rivers` array. Defaults to `true`. Pass `false` for a pure tributary list.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_RIVERS_BY_BASIN_LIMIT,
          description: `Maximum rivers to return in the response (default ${DEFAULT_FIND_RIVERS_BY_BASIN_LIMIT}). \`count\` still reports the full unlimited total.`,
        },
      },
      required: ["basin"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        basin?: unknown;
        include_self?: unknown;
        limit?: unknown;
      };

      const parsed = parseEntityRef(input.basin, "basin");
      if (!parsed.ok) return errorResult(parsed.error);

      const includeSelf = parseIncludeSelf(input.include_self);
      if (typeof includeSelf === "string") return errorResult(includeSelf);

      const limit = parseLimit(input.limit);
      if (typeof limit === "string") return errorResult(limit);

      const resolved = runtime.resolveBasin(parsed.ref);
      if (resolved === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (resolved === "not-found") {
        return errorResult(
          `No river found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }

      const result = runtime.find(resolved.i, includeSelf, limit);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }

      return okResult({
        basin: { i: resolved.i, name: resolved.name },
        rivers: result.rivers,
        count: result.count,
      });
    },
  };
}

export const findRiversByBasinTool = createFindRiversByBasinTool();
