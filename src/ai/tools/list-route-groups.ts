import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawRoute,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Hard-coded in `public/modules/ui/route-group-editor.js` — the three
 * canonical groups whose `<g>` containers are the editor's standard
 * tabs. Re-defined locally (not coupled to `list-routes.ts`'s
 * `ROUTE_GROUPS`) so a future canonical-groups extension doesn't
 * accidentally make the default-groups list grow. Matches the literal
 * used by `add_route_group` / `remove_route_group`.
 */
export const DEFAULT_ROUTE_GROUPS = ["roads", "trails", "searoutes"] as const;

/** A single entry in the tool's response array. */
export interface RouteGroupSummary {
  id: string;
  route_count: number;
  is_default: boolean;
}

/**
 * Description of a single `<g>` element under #routes — what the
 * runtime hands back from `readGroupElements`. The `childCount` is
 * used as a fallback when `pack.routes` is unavailable.
 */
export interface RouteGroupElement {
  id: string;
  childCount: number;
}

export interface ListRouteGroupsRuntime {
  /**
   * Return the ordered list of `<g>` children directly under the
   * `#routes` SVG layer (i.e. one entry per route group), in document
   * order. Returns `null` when the routes layer is unavailable —
   * which the tool surfaces as an error.
   */
  readGroupElements(): RouteGroupElement[] | null;
  /**
   * Return `pack.routes` when available so we can compute the live
   * (non-removed) route count per group. Returns `null` when the pack
   * (or its `routes` array) is missing — in that case the tool falls
   * back to the SVG child counts.
   */
  readPackRoutes(): RawRoute[] | null;
}

interface RoutePackLike {
  routes?: RawRoute[];
}

interface MinimalElementLike {
  id?: string;
  children?: ArrayLike<{ tagName?: string }>;
  tagName?: string;
}

interface D3MultiSelectionLike {
  // d3 v5/v6 store the live nodes under `_groups[0]`. We mirror the
  // exact path used by `addLines()` in route-group-editor.js so we
  // pick up whatever the UI sees.
  _groups?: ArrayLike<unknown>[];
}

interface RoutesD3SelectionLike {
  selectAll?: (selector: string) => D3MultiSelectionLike;
}

function elementChildCount(el: MinimalElementLike): number {
  const children = el.children;
  if (!children || typeof children.length !== "number") return 0;
  return children.length;
}

function readFromD3Selection(): RouteGroupElement[] | null {
  const routesSel = getGlobal<RoutesD3SelectionLike>("routes");
  if (!routesSel || typeof routesSel.selectAll !== "function") return null;
  const sel = routesSel.selectAll("g");
  const nodes = sel?._groups?.[0];
  if (!nodes || typeof nodes.length !== "number") return null;
  const out: RouteGroupElement[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i] as MinimalElementLike | null | undefined;
    if (!el || typeof el.id !== "string") continue;
    out.push({ id: el.id, childCount: elementChildCount(el) });
  }
  return out;
}

function readFromDom(): RouteGroupElement[] | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("routes");
  if (!root) return null;
  const out: RouteGroupElement[] = [];
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

export const defaultListRouteGroupsRuntime: ListRouteGroupsRuntime = {
  readGroupElements(): RouteGroupElement[] | null {
    const fromD3 = readFromD3Selection();
    if (fromD3) return fromD3;
    return readFromDom();
  },
  readPackRoutes(): RawRoute[] | null {
    const routes = getPack<RoutePackLike>()?.routes;
    return Array.isArray(routes) ? routes : null;
  },
};

function buildCountMap(routes: RawRoute[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of routes) {
    if (!r || r.removed) continue;
    if (typeof r.group !== "string") continue;
    counts.set(r.group, (counts.get(r.group) ?? 0) + 1);
  }
  return counts;
}

export function createListRouteGroupsTool(
  runtime: ListRouteGroupsRuntime = defaultListRouteGroupsRuntime,
): Tool {
  return {
    name: "list_route_groups",
    description: `List the existing route groups on the current map — same source the Route Groups Editor reads (route-group-editor.js → addLines): direct <g> children of the #routes SVG layer, in document order. Each entry reports id (e.g. "roads", "trails", "searoutes", or a custom group like "route-pilgrim"), route_count (live routes in pack.routes whose route.group === id, skipping removed: true entries — falls back to the <g>'s child element count when pack.routes is unavailable), and is_default (true iff id is one of ${DEFAULT_ROUTE_GROUPS.join(", ")}). Pair with add_route_group / remove_route_group for management. Returns { count, groups }. Read-only; takes no parameters. Errors when the #routes SVG layer is missing.`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const elements = runtime.readGroupElements();
      if (elements === null) {
        return errorResult(
          "Routes layer is unavailable; cannot list route groups. Wait for the map to finish loading.",
        );
      }
      const packRoutes = runtime.readPackRoutes();
      const counts = packRoutes ? buildCountMap(packRoutes) : null;
      const defaults = new Set<string>(DEFAULT_ROUTE_GROUPS);

      const groups: RouteGroupSummary[] = elements.map((el) => ({
        id: el.id,
        route_count: counts ? (counts.get(el.id) ?? 0) : el.childCount,
        is_default: defaults.has(el.id),
      }));

      return okResult({ count: groups.length, groups });
    },
  };
}

export const listRouteGroupsTool = createListRouteGroupsTool();
