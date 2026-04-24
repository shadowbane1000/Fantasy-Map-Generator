import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ReligionDistributionEntry {
  i: number;
  name: string;
  color: string | null;
  type: string | null;
  form: string | null;
  cells_count: number;
  percentage: number;
  area: number;
  followers: number;
}

export interface ReligionDistribution {
  total_cells: number;
  total_followers: number;
  religions: ReligionDistributionEntry[];
}

export interface ReligionDistributionPackLike {
  religions?: RawReligion[];
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeMultiplier(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Pure aggregator: given the world state (`pack`) and the display
 * `populationRate`, compute the distribution of religions — one entry per
 * active (non-placeholder, non-removed) religion — sorted by `cells_count`
 * descending. Followers scale raw `rural + urban` by `populationRate` (with
 * the same `rate <= 0 / NaN -> 1` fallback `list_religions` uses).
 * Percentage is `cells_count / total_cells * 100` (0 when `total_cells` is
 * 0). Returns `"not-ready"` when `pack` / `pack.religions` is missing.
 */
export function readReligionDistributionFromPack(
  pack: ReligionDistributionPackLike | undefined,
  populationRate: number,
): ReligionDistribution | "not-ready" {
  if (!pack?.religions) return "not-ready";

  const rate = safeMultiplier(populationRate);

  interface WorkingEntry {
    i: number;
    name: string;
    color: string | null;
    type: string | null;
    form: string | null;
    cells_count: number;
    area: number;
    followers: number;
  }

  const working: WorkingEntry[] = [];
  let totalCells = 0;
  let totalFollowers = 0;

  for (const religion of pack.religions) {
    if (!religion) continue;
    if (religion.i === 0) continue;
    if (religion.removed) continue;

    const cells = numeric(religion.cells);
    const area = numeric(religion.area);
    const rawPop = numeric(religion.rural) + numeric(religion.urban);
    const followers = Math.max(0, Math.round(rawPop * rate));

    working.push({
      i: religion.i,
      name: typeof religion.name === "string" ? religion.name : "",
      color: typeof religion.color === "string" ? religion.color : null,
      type: typeof religion.type === "string" ? religion.type : null,
      form: typeof religion.form === "string" ? religion.form : null,
      cells_count: cells,
      area,
      followers,
    });

    totalCells += cells;
    totalFollowers += followers;
  }

  working.sort((a, b) => b.cells_count - a.cells_count);

  const religions: ReligionDistributionEntry[] = working.map((entry) => ({
    i: entry.i,
    name: entry.name,
    color: entry.color,
    type: entry.type,
    form: entry.form,
    cells_count: entry.cells_count,
    percentage: totalCells > 0 ? (entry.cells_count / totalCells) * 100 : 0,
    area: entry.area,
    followers: entry.followers,
  }));

  return {
    total_cells: totalCells,
    total_followers: totalFollowers,
    religions,
  };
}

export interface ReligionDistributionRuntime {
  readDistribution(): ReligionDistribution | "not-ready";
}

export const defaultReligionDistributionRuntime: ReligionDistributionRuntime = {
  readDistribution(): ReligionDistribution | "not-ready" {
    const pack = getPack<ReligionDistributionPackLike>();
    const populationRate = getGlobal<number>("populationRate");
    return readReligionDistributionFromPack(
      pack,
      typeof populationRate === "number" ? populationRate : 1,
    );
  },
};

export function createGetReligionDistributionTool(
  runtime: ReligionDistributionRuntime = defaultReligionDistributionRuntime,
): Tool {
  return {
    name: "get_religion_distribution",
    description:
      "Read the aggregate distribution of religions across the current map — the religion-level parallel of `get_population_stats` and a companion to `list_religions` / `find_largest_religions`. Iterates `pack.religions` linearly, skipping the index-0 'No religion' placeholder and any `removed: true` entries, and uses the pre-aggregated per-religion fields (`religion.cells`, `religion.area`, `religion.rural + religion.urban`) — no per-cell scan, so it stays O(religions). Followers are computed as `Math.round((rural + urban) × populationRate)` with the same `rate <= 0 / NaN → 1` fallback `list_religions` uses (but NOT multiplied by `urbanization`, since a religion's rural + urban is already the combined raw total). `percentage` is each religion's share of `total_cells` — `cells_count / total_cells × 100`, floating, 0 when `total_cells` is 0. Returns `{ ok, total_cells, total_followers, religions }` sorted by `cells_count` descending. Each religion is `{ i, name, color, type, form, cells_count, percentage, area, followers }`; `color` / `type` / `form` fall back to `null` when the raw religion omits them. `total_cells` is the sum of `religion.cells` over active religions (NOT the total map cell count — cells without an organized religion sit on id 0 and are excluded). `total_followers` is the sum of the per-religion scaled follower counts. Accepts no parameters. When the map has no active religions, `religions` is `[]`, `total_cells` and `total_followers` are `0`, still `ok: true`. Useful for audits (how is faith distributed across the map?), demographic summaries that need per-religion follower counts, and deciding which religions to rename / recolor / retype. Read-only — never mutates the pack. Errors only on un-generated map (pack or `pack.religions` missing). Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const result = runtime.readDistribution();
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getReligionDistributionTool = createGetReligionDistributionTool();
