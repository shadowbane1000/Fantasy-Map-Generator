import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * The stored shape of an entry in `options.burgs.groups` (see
 * `public/modules/ui/burg-group-editor.js` `submitForm()`). All fields
 * are intentionally optional/loose because the legacy editor stores a
 * "compacted" object: `null`-valued fields are stripped before save.
 */
export interface BurgGroup {
  name?: string;
  order?: number;
  preview?: string;
  min?: number;
  max?: number;
  percentile?: number;
  biomes?: string;
  states?: string;
  cultures?: string;
  religions?: string;
  features?: Record<string, unknown>;
  active?: boolean;
  isDefault?: boolean;
}

/**
 * Output shape for one group. Field names are snake_case where the
 * tool API has settled on snake_case (only `is_default` here, since
 * everything else is already a single token).
 */
export interface BurgGroupSummary {
  name: string;
  order: number | null;
  preview: string | null;
  min: number | null;
  max: number | null;
  percentile: number | null;
  biomes: string | null;
  states: string | null;
  cultures: string | null;
  religions: string | null;
  features: Record<string, unknown>;
  active: boolean;
  is_default: boolean;
  burg_count: number;
}

interface RawBurgLike {
  removed?: boolean;
  group?: unknown;
}

interface BurgGroupsOptionsLike {
  burgs?: { groups?: unknown };
}

interface BurgGroupsPackLike {
  burgs?: RawBurgLike[];
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Counts non-removed burgs whose `group` field equals the supplied
 * group name. Mirrors the editor's `createLine` count expression.
 */
export function countBurgsForGroup(
  burgs: RawBurgLike[] | undefined,
  name: string,
): number {
  if (!burgs) return 0;
  let count = 0;
  for (const b of burgs) {
    if (!b) continue;
    if (b.removed) continue;
    if (b.group === name) count++;
  }
  return count;
}

/**
 * Pure mapper: stored group + count → summary. All scalar
 * normalization and feature-object copy lives here so tests can drive
 * it directly without setting up globals.
 */
export function mapBurgGroup(
  group: BurgGroup,
  burgCount: number,
): BurgGroupSummary {
  const featuresObj =
    group.features && typeof group.features === "object"
      ? { ...group.features }
      : {};
  return {
    name: typeof group.name === "string" ? group.name : "",
    order: nullableNumber(group.order),
    preview: nullableNonEmptyString(group.preview),
    min: nullableNumber(group.min),
    max: nullableNumber(group.max),
    percentile: nullableNumber(group.percentile),
    biomes: nullableNonEmptyString(group.biomes),
    states: nullableNonEmptyString(group.states),
    cultures: nullableNonEmptyString(group.cultures),
    religions: nullableNonEmptyString(group.religions),
    features: featuresObj,
    active: group.active === true,
    is_default: group.isDefault === true,
    burg_count: burgCount,
  };
}

export interface BurgGroupsState {
  groups: unknown;
  burgs: RawBurgLike[] | undefined;
}

export interface ReadBurgGroupsResult {
  groups: BurgGroupSummary[];
  packBurgsMissing: boolean;
}

/**
 * Combines the stored groups array with the burg counts. Returns
 * `{ error }` when the groups array is missing or wrong-typed; that's
 * the only condition the caller surfaces as `errorResult`.
 */
export function readBurgGroupsFromState(
  state: BurgGroupsState,
): ReadBurgGroupsResult | { error: string } {
  if (!Array.isArray(state.groups)) {
    return { error: "options.burgs.groups is missing or not an array." };
  }
  const packBurgsMissing = !Array.isArray(state.burgs);
  const summaries = state.groups.map((g) => {
    const group = (g ?? {}) as BurgGroup;
    const name = typeof group.name === "string" ? group.name : "";
    const count = packBurgsMissing ? 0 : countBurgsForGroup(state.burgs, name);
    return mapBurgGroup(group, count);
  });
  return { groups: summaries, packBurgsMissing };
}

export interface ListBurgGroupsRuntime {
  readState(): BurgGroupsState;
}

export const defaultListBurgGroupsRuntime: ListBurgGroupsRuntime = {
  readState(): BurgGroupsState {
    const options = getGlobal<BurgGroupsOptionsLike>("options");
    const pack = getPack<BurgGroupsPackLike>();
    return {
      groups: options?.burgs?.groups,
      burgs: Array.isArray(pack?.burgs) ? pack?.burgs : undefined,
    };
  },
};

interface ListBurgGroupsInput {
  include_inactive?: unknown;
}

export function createListBurgGroupsTool(
  runtime: ListBurgGroupsRuntime = defaultListBurgGroupsRuntime,
): Tool {
  return {
    name: "list_burg_groups",
    description:
      "List the configured burg groups (`options.burgs.groups`) with per-group burg counts — the read companion to the Burg Groups Editor (`burg-group-editor.js` → `addLines()` / `createLine()`). Each entry reports `name`, `order`, `preview` (one of `watabou-city`/`watabou-village`/`watabou-dwelling` or null), `min`/`max`/`percentile` population constraints, csv limitation strings (`biomes`, `states`, `cultures`, `religions`; null when absent/empty), the `features` object map, `active`, `is_default`, and `burg_count` (count of non-removed burgs whose `b.group` matches `name`). Order matches the stored array order (NOT sorted by `order` and NOT alphabetical). Optional `include_inactive` (default true): when false, groups with `active: false` are filtered out. Read-only.",
    input_schema: {
      type: "object",
      properties: {
        include_inactive: {
          type: "boolean",
          description:
            "When false, omit groups where `active === false`. Defaults to true.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as ListBurgGroupsInput;
      let includeInactive = true;
      if (
        input.include_inactive !== undefined &&
        input.include_inactive !== null
      ) {
        if (typeof input.include_inactive !== "boolean") {
          return errorResult("include_inactive must be a boolean.");
        }
        includeInactive = input.include_inactive;
      }

      const state = runtime.readState();
      const result = readBurgGroupsFromState(state);
      if ("error" in result) {
        return errorResult(result.error);
      }

      const total = result.groups.length;
      const filtered = includeInactive
        ? result.groups
        : result.groups.filter((g) => g.active);

      const body: Record<string, unknown> = {
        groups: filtered,
        count: filtered.length,
        total,
      };
      if (result.packBurgsMissing) {
        body.pack_burgs_missing = true;
        body.note =
          "`pack.burgs` unavailable; per-group burg_count reported as 0.";
      }
      return okResult(body);
    },
  };
}

export const listBurgGroupsTool = createListBurgGroupsTool();
