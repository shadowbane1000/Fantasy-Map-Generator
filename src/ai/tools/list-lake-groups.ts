import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Default lake-group ids — matches the literal in `removeLakeGroup`
 * (`public/modules/ui/lakes-editor.js`). Kept locally so a future
 * canonical-groups extension doesn't accidentally make the
 * default-groups list grow.
 */
export const DEFAULT_LAKE_GROUPS = [
  "freshwater",
  "salt",
  "sinkhole",
  "frozen",
  "lava",
  "dry",
] as const;

/** A single entry in the tool's response array. */
export interface LakeGroupSummary {
  id: string;
  lake_count: number;
  is_default: boolean;
}

/**
 * Description of a single `<g>` element under #lakes — what the
 * runtime hands back from `readGroupElements`. The `childCount` is
 * used as a fallback when `pack.features` is unavailable.
 */
export interface LakeGroupElement {
  id: string;
  childCount: number;
}

export interface ListLakeGroupsRuntime {
  /**
   * Return the ordered list of `<g>` children directly under the
   * `#lakes` SVG layer (i.e. one entry per lake group), in document
   * order. Returns `null` when the lakes layer is unavailable —
   * which the tool surfaces as an error.
   */
  readGroupElements(): LakeGroupElement[] | null;
  /**
   * Return `pack.features` when available so we can compute the live
   * (non-removed) lake count per group. Returns `null` when the pack
   * (or its `features` array) is missing — in that case the tool falls
   * back to the SVG child counts.
   */
  readPackFeatures(): unknown[] | null;
}

interface FeaturesPackLike {
  features?: unknown[];
}

interface MinimalElementLike {
  id?: string;
  children?: ArrayLike<{ tagName?: string }>;
  tagName?: string;
}

interface D3MultiSelectionLike {
  // d3 v5/v6 store the live nodes under `_groups[0]`. We mirror the
  // exact path used by `selectLakeGroup()` in lakes-editor.js so we
  // pick up whatever the UI sees.
  _groups?: ArrayLike<unknown>[];
}

interface LakesD3SelectionLike {
  selectAll?: (selector: string) => D3MultiSelectionLike;
}

interface LakeFeatureLike {
  type?: unknown;
  group?: unknown;
  removed?: unknown;
}

function elementChildCount(el: MinimalElementLike): number {
  const children = el.children;
  if (!children || typeof children.length !== "number") return 0;
  return children.length;
}

function readFromD3Selection(): LakeGroupElement[] | null {
  const lakesSel = getGlobal<LakesD3SelectionLike>("lakes");
  if (!lakesSel || typeof lakesSel.selectAll !== "function") return null;
  const sel = lakesSel.selectAll("g");
  const nodes = sel?._groups?.[0];
  if (!nodes || typeof nodes.length !== "number") return null;
  const out: LakeGroupElement[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i] as MinimalElementLike | null | undefined;
    if (!el || typeof el.id !== "string") continue;
    out.push({ id: el.id, childCount: elementChildCount(el) });
  }
  return out;
}

function readFromDom(): LakeGroupElement[] | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("lakes");
  if (!root) return null;
  const out: LakeGroupElement[] = [];
  const children = root.children;
  if (!children || typeof children.length !== "number") return out;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i] as unknown as MinimalElementLike;
    const tag = (child?.tagName ?? "").toLowerCase();
    if (tag !== "g") continue;
    if (typeof child.id !== "string") continue;
    out.push({ id: child.id, childCount: elementChildCount(child) });
  }
  return out;
}

export const defaultListLakeGroupsRuntime: ListLakeGroupsRuntime = {
  readGroupElements(): LakeGroupElement[] | null {
    const fromD3 = readFromD3Selection();
    if (fromD3) return fromD3;
    return readFromDom();
  },
  readPackFeatures(): unknown[] | null {
    const features = getPack<FeaturesPackLike>()?.features;
    return Array.isArray(features) ? features : null;
  },
};

function buildCountMap(features: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  // pack.features[0] is a placeholder slot; skip it.
  for (let i = 1; i < features.length; i += 1) {
    const entry = features[i];
    if (!entry || typeof entry !== "object") continue;
    const f = entry as LakeFeatureLike;
    if (f.type !== "lake") continue;
    if (f.removed === true) continue;
    if (typeof f.group !== "string") continue;
    counts.set(f.group, (counts.get(f.group) ?? 0) + 1);
  }
  return counts;
}

export function createListLakeGroupsTool(
  runtime: ListLakeGroupsRuntime = defaultListLakeGroupsRuntime,
): Tool {
  return {
    name: "list_lake_groups",
    description: `List the existing lake groups on the current map — same source the Edit Lake dialog reads (lakes-editor.js → selectLakeGroup): direct <g> children of the #lakes SVG layer, in document order. Each entry reports id (e.g. "freshwater", "salt", "sinkhole", "frozen", "lava", "dry", or any custom group), lake_count (live lakes in pack.features whose feature.type === "lake" and feature.group === id, skipping removed: true entries — falls back to the <g>'s child element count when pack.features is unavailable), and is_default (true iff id is one of ${DEFAULT_LAKE_GROUPS.join(", ")}). Pair with set_lake_group to move a lake between groups. Returns { count, groups }. Read-only; takes no parameters. Errors when the #lakes SVG layer is missing.`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const elements = runtime.readGroupElements();
      if (elements === null) {
        return errorResult(
          "Lakes layer is unavailable; cannot list lake groups. Wait for the map to finish loading.",
        );
      }
      const packFeatures = runtime.readPackFeatures();
      const counts = packFeatures ? buildCountMap(packFeatures) : null;
      const defaults = new Set<string>(DEFAULT_LAKE_GROUPS);

      const groups: LakeGroupSummary[] = elements.map((el) => ({
        id: el.id,
        lake_count: counts ? (counts.get(el.id) ?? 0) : el.childCount,
        is_default: defaults.has(el.id),
      }));

      return okResult({ count: groups.length, groups });
    },
  };
}

export const listLakeGroupsTool = createListLakeGroupsTool();
