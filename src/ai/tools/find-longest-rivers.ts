import { errorResult, getPack, okResult, type RawRiver } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_LONGEST_RIVERS_N = 10;
export const MAX_FIND_LONGEST_RIVERS_N = 500;

export interface FindLongestRiversHit {
  i: number;
  name: string;
  type: string | null;
  length: number;
  discharge: number;
  source: number;
  mouth: number;
}

export interface FindLongestRiversPayload {
  rivers: FindLongestRiversHit[];
  count: number;
  requested_n: number;
}

export type FindLongestRiversResult = FindLongestRiversPayload | "not-ready";

interface PackLike {
  rivers?: RawRiver[];
}

function riverLength(r: RawRiver): number {
  return typeof r.length === "number" && Number.isFinite(r.length)
    ? r.length
    : 0;
}

function toHit(r: RawRiver): FindLongestRiversHit {
  return {
    i: r.i,
    name: typeof r.name === "string" ? r.name : "",
    type: typeof r.type === "string" ? r.type : null,
    length: riverLength(r),
    discharge:
      typeof r.discharge === "number" && Number.isFinite(r.discharge)
        ? r.discharge
        : 0,
    source: typeof r.source === "number" ? r.source : 0,
    mouth: typeof r.mouth === "number" ? r.mouth : 0,
  };
}

/**
 * Pure scanner: returns the top `n` non-removed rivers from
 * `pack.rivers`, ranked by `river.length` descending. Skips the
 * index-0 placeholder and any `removed: true` entry. Rivers with
 * missing / non-finite `length` are treated as `length === 0`
 * (they still participate but sort to the end). `requested_n` is
 * echoed back so callers see the effective cap.
 */
export function findLongestRiversInPack(
  pack: PackLike | undefined,
  n: number,
): FindLongestRiversResult {
  if (!pack || !pack.rivers) return "not-ready";

  const actives: RawRiver[] = [];
  for (const r of pack.rivers) {
    if (!r) continue;
    if (r.i === 0) continue;
    if (r.removed) continue;
    actives.push(r);
  }

  actives.sort((a, b) => riverLength(b) - riverLength(a));
  const sliced = n > 0 ? actives.slice(0, n) : [];
  const rivers = sliced.map(toHit);

  return { rivers, count: rivers.length, requested_n: n };
}

export interface FindLongestRiversRuntime {
  find(n: number): FindLongestRiversResult;
}

export const defaultFindLongestRiversRuntime: FindLongestRiversRuntime = {
  find(n) {
    return findLongestRiversInPack(getPack<PackLike>(), n);
  },
};

function parseN(raw: unknown): number | string {
  if (raw === undefined || raw === null) return DEFAULT_FIND_LONGEST_RIVERS_N;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_FIND_LONGEST_RIVERS_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_LONGEST_RIVERS_N}].`;
  }
  return raw;
}

export function createFindLongestRiversTool(
  runtime: FindLongestRiversRuntime = defaultFindLongestRiversRuntime,
): Tool {
  return {
    name: "find_longest_rivers",
    description:
      "Return the top `n` non-removed rivers on the current map ranked by `river.length` descending — the ranking parallel to `list_rivers` (paginated, arbitrary order) and the river companion to any top-N burg / state ranker. Optional `n` is an integer in [1, 500] and defaults to 10. Scans `pack.rivers` linearly, skipping the index-0 placeholder and any `removed: true` entries, sorts the remaining rivers by `length` descending (rivers with missing / non-finite `length` are treated as 0 and sort to the end; ties keep pack order via stable sort), slices the top `n`, and returns `{ ok, rivers, count, requested_n }`. Each river is `{ i, name, type, length, discharge, source, mouth }` where `type` falls back to `null` when the raw river omits it and all numeric fields fall back to 0. `count` is the length of the returned `rivers` array (which may be less than `n` when fewer active rivers exist); `requested_n` echoes the effective `n` after defaulting. When the map has no active rivers, `rivers` is `[]` and `count` is `0` — still `ok: true`. Errors on missing map (`pack` or `pack.rivers`) or out-of-range `n` (non-integer, < 1, > 500). Read-only. Useful as a first step for headline-river operations — feed the returned ids into `get_river_info`, or filter candidates for `rename_river` / `set_river_type` / `set_river_width` / `remove_river` / `regenerate_river_names`. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_LONGEST_RIVERS_N,
          description: `Maximum rivers to return, ranked by length descending (default ${DEFAULT_FIND_LONGEST_RIVERS_N}).`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { n?: unknown };
      const parsed = parseN(input.n);
      if (typeof parsed === "string") return errorResult(parsed);
      const result = runtime.find(parsed);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({
        rivers: result.rivers,
        count: result.count,
        requested_n: result.requested_n,
      });
    },
  };
}

export const findLongestRiversTool = createFindLongestRiversTool();
