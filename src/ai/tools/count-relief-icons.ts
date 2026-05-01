import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * A single entry in the response `by_type` array.
 *
 * `type` is the full `href` value of the `<use>` element including the
 * leading `#` (e.g. `"#relief-mount-1"`), since the legacy renderer
 * stores it that way (`src/renderers/draw-relief-icons.ts` →
 * `getIcon()` returns the `#`-prefixed string and writes it directly
 * into the `href` attribute).
 */
export interface ReliefIconTypeCount {
  type: string;
  count: number;
}

export interface CountReliefIconsRuntime {
  /**
   * Return the SVG element rooted at `<g id="terrain">` that holds the
   * relief `<use>` icons. Returns `null` when neither the
   * `window.terrain` D3 selection nor a `#terrain` DOM element exists,
   * which the tool surfaces as an error.
   */
  getTerrainRoot(): Element | null;
}

interface D3SelectionLike {
  node?: () => Element | null;
}

export const defaultCountReliefIconsRuntime: CountReliefIconsRuntime = {
  getTerrainRoot(): Element | null {
    const sel = getGlobal<D3SelectionLike>("terrain");
    if (sel && typeof sel.node === "function") {
      const node = sel.node();
      if (node) return node;
    }
    if (typeof document !== "undefined") {
      const el = document.getElementById("terrain");
      if (el) return el;
    }
    return null;
  },
};

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function tally(root: Element): Map<string, number> {
  const counts = new Map<string, number>();
  const uses = root.querySelectorAll("use");
  for (let i = 0; i < uses.length; i += 1) {
    const node = uses[i];
    const href = node.getAttribute("href");
    if (!href) continue;
    counts.set(href, (counts.get(href) ?? 0) + 1);
  }
  return counts;
}

function sortedByType(counts: Map<string, number>): ReliefIconTypeCount[] {
  const entries: ReliefIconTypeCount[] = [];
  for (const [type, count] of counts) entries.push({ type, count });
  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.type < b.type) return -1;
    if (a.type > b.type) return 1;
    return 0;
  });
  return entries;
}

export function createCountReliefIconsTool(
  runtime: CountReliefIconsRuntime = defaultCountReliefIconsRuntime,
): Tool {
  return {
    name: "count_relief_icons",
    description:
      'Count the relief icons (mountains, hills, trees, swamps, etc) currently on the map — read-only discovery primitive for the <use> elements under <g id="terrain"> (no equivalent UI affordance: the user can only see icons by zooming around). Each <use> has no unique id, only an href attribute like "#relief-mount-1" or "#relief-hill-1-bw" (the legacy renderer stores the leading "#" in the attribute). Optional `type` filter (string starting with "#") narrows the breakdown to a single type — count is 0 if absent. Returns { ok, total, by_type, filtered_type? }: total is the unfiltered grand total; by_type is an array of { type, count } sorted by count descending then type ascending; filtered_type is present only when `type` was supplied. Errors when neither window.terrain nor #terrain SVG element is available, or when `type` is non-string or omits the leading "#". Pair with clear_relief_icons for count → confirm → clear-by-type.',
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            'Optional filter: the full href value to count, with leading "#" (e.g. "#relief-mount-1"). When set, by_type contains exactly one entry for that type (count may be 0). When omitted, by_type contains every type that has at least one icon.',
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown };

      let typeFilter: string | null = null;
      if (input.type !== undefined && input.type !== null) {
        if (!isString(input.type)) {
          return errorResult("type must be a string.");
        }
        if (!input.type.startsWith("#")) {
          return errorResult("type must start with '#'.");
        }
        typeFilter = input.type;
      }

      const root = runtime.getTerrainRoot();
      if (!root) {
        return errorResult(
          "Terrain layer is unavailable; cannot count relief icons. Wait for the map to finish loading.",
        );
      }

      const counts = tally(root);

      let total = 0;
      for (const v of counts.values()) total += v;

      const by_type: ReliefIconTypeCount[] =
        typeFilter !== null
          ? [{ type: typeFilter, count: counts.get(typeFilter) ?? 0 }]
          : sortedByType(counts);

      const body: Record<string, unknown> = { total, by_type };
      if (typeFilter !== null) body.filtered_type = typeFilter;

      return okResult(body);
    },
  };
}

export const countReliefIconsTool = createCountReliefIconsTool();
