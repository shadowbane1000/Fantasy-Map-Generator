import { errorResult, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_FIND_HIGHEST_PEAKS_N = 10;
export const MAX_FIND_HIGHEST_PEAKS_N = 500;
/**
 * Minimum height for a cell to count as "land" in this codebase —
 * `ELEVATION_NEUTRAL_HEIGHT`. Heights in `[0, 19]` are water, `20` is
 * shore / sea level, `21-100` is land proper.
 */
export const LAND_HEIGHT_MIN = 20;

export interface FindHighestPeaksHit {
  cell: number;
  height: number;
  x: number;
  y: number;
}

export interface FindHighestPeaksPayload {
  peaks: FindHighestPeaksHit[];
  count: number;
  requested_n: number;
}

export type FindHighestPeaksResult = FindHighestPeaksPayload | "not-ready";

interface PackLike {
  cells?: {
    h?: ArrayLike<number>;
    p?: ArrayLike<ArrayLike<number>>;
  };
}

function coord(
  p: ArrayLike<ArrayLike<number>> | undefined,
  i: number,
  axis: 0 | 1,
): number {
  if (!p) return 0;
  const pair = p[i];
  if (!pair) return 0;
  const v = pair[axis];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Pure scanner: given the world state (`pack`), collect every land cell
 * (`pack.cells.h[i] >= LAND_HEIGHT_MIN`), sort by height descending, and
 * return the top `n` as `{ cell, height, x, y }`. Coordinates come from
 * `pack.cells.p[i]` and fall back to 0 when absent / non-numeric.
 * Stable sort via the browser / Node engine keeps tie order deterministic
 * by original cell index.
 *
 * Returns `"not-ready"` when pack / cells / h / p are missing or h does
 * not expose a numeric `length`.
 */
export function findHighestPeaksInPack(
  pack: PackLike | undefined,
  n: number,
): FindHighestPeaksResult {
  if (!pack || !pack.cells) return "not-ready";
  const h = pack.cells.h;
  const p = pack.cells.p;
  if (!h || typeof h.length !== "number") return "not-ready";
  if (!p) return "not-ready";

  const cap = n > 0 ? n : 0;
  const candidates: FindHighestPeaksHit[] = [];
  const length = h.length;
  for (let i = 0; i < length; i++) {
    const height = h[i];
    if (typeof height !== "number") continue;
    if (height < LAND_HEIGHT_MIN) continue;
    candidates.push({
      cell: i,
      height,
      x: coord(p, i, 0),
      y: coord(p, i, 1),
    });
  }

  candidates.sort((a, b) => b.height - a.height);
  const peaks = candidates.slice(0, cap);

  return { peaks, count: peaks.length, requested_n: n };
}

export interface FindHighestPeaksRuntime {
  find(n: number): FindHighestPeaksResult;
}

export const defaultFindHighestPeaksRuntime: FindHighestPeaksRuntime = {
  find(n) {
    return findHighestPeaksInPack(getPack<PackLike>(), n);
  },
};

function parseN(raw: unknown): number | string {
  if (raw === undefined || raw === null) return DEFAULT_FIND_HIGHEST_PEAKS_N;
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_FIND_HIGHEST_PEAKS_N
  ) {
    return `n must be an integer in [1, ${MAX_FIND_HIGHEST_PEAKS_N}].`;
  }
  return raw;
}

export function createFindHighestPeaksTool(
  runtime: FindHighestPeaksRuntime = defaultFindHighestPeaksRuntime,
): Tool {
  return {
    name: "find_highest_peaks",
    description:
      "Return the top `n` land cells on the current map ranked by `pack.cells.h[i]` descending — the elevation ranking parallel to `find_largest_burgs` (burgs by population) and `find_longest_rivers` (rivers by length), and the ranking counterpart to the filter-style `find_cells_by_height_range` (which returns every cell in an inclusive `[min, max]` band). Answers prompts like \"where are the highest peaks on the map?\" without forcing the caller to pick a numeric threshold. Optional `n` (integer in [1, 500], default 10) caps how many peaks come back. Iterates `pack.cells.h` linearly and collects every cell whose height is `>= 20` (`ELEVATION_NEUTRAL_HEIGHT` — in this codebase heights in `[0, 19]` are water, `20` is shore / sea level, `21-100` is land proper). Water cells (`h < 20`) are always excluded — use `find_cells_by_height_range` with `{min: 0, max: 19}` for the deep-water parallel. Each candidate is tagged with its coordinate from `pack.cells.p[i]` (same centroid used by `get_cell_info` and `add_marker`); missing / non-numeric coordinates fall back to 0. Sorts the survivors by `height` descending (ties keep original cell-index order via stable sort) and slices the top `n`. Returns `{ ok, peaks, count, requested_n }` where each peak is `{ cell, height, x, y }` — `cell` is the packed cell index, ready to feed straight into `get_cell_info`, `add_marker`, `set_cell_height`, or `add_burg`. `count` is the length of the returned `peaks` array (can be less than `n` when the map has fewer land cells); `requested_n` echoes the effective `n` after defaulting. When the map has no land cells, `peaks` is `[]` and `count` is `0` — still `ok: true`. Errors on un-generated map (pack, `pack.cells`, `pack.cells.h`, or `pack.cells.p` missing) or out-of-range `n` (non-integer, < 1, > 500). Useful as a first step for headline-peak operations — name the highest summits with `add_marker`, audit candidate mountaintop burg sites, target `set_cell_height` on the tallest cells, or feed the ids into `get_cell_info` for a localized highlands tour. Read-only. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          minimum: 1,
          maximum: MAX_FIND_HIGHEST_PEAKS_N,
          description: `Maximum peaks to return, ranked by height descending (default ${DEFAULT_FIND_HIGHEST_PEAKS_N}, max ${MAX_FIND_HIGHEST_PEAKS_N}).`,
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
        peaks: result.peaks,
        count: result.count,
        requested_n: result.requested_n,
      });
    },
  };
}

export const findHighestPeaksTool = createFindHighestPeaksTool();
