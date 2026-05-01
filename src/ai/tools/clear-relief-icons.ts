import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Clear (delete) relief icons — same side-effect as the bulk-remove
 * branch of `removeIcon` in `public/modules/ui/relief-editor.js`:
 *
 * ```js
 * const type = reliefIconsDiv.querySelector("svg.pressed")?.dataset.type;
 * selection = type
 *   ? terrain.selectAll("use[href='" + type + "']")
 *   : terrain.selectAll("use");
 * selection.remove();
 * ```
 *
 * Relief icons are pure SVG state: they're `<use>` elements under
 * `<g id="terrain">` that reference symbol definitions via `href`.
 * They are NOT mirrored in `pack` (no `pack.cells.icons` or similar —
 * see `src/types/PackedGraph.ts`), so removing them is a DOM-only
 * operation. They have no unique IDs, which is why the tool operates
 * by `href` type or wholesale.
 *
 * Destructive: there is no undo for this operation.
 */

interface TerrainSelectionLike {
  /** D3 selection's underlying DOM node — the `<g id="terrain">`. */
  node?: () => Element | null;
}

export interface ClearReliefIconsRuntime {
  /**
   * Return the terrain SVG root element (`<g id="terrain">`) — the
   * container under which relief `<use>` icons live. Return `null`
   * when neither the `window.terrain` D3 selection nor the `#terrain`
   * SVG element is available (e.g. the map hasn't loaded yet).
   */
  getTerrainRoot(): Element | null;
}

export const defaultClearReliefIconsRuntime: ClearReliefIconsRuntime = {
  getTerrainRoot(): Element | null {
    const terrain = getGlobal<TerrainSelectionLike>("terrain");
    if (terrain && typeof terrain.node === "function") {
      const node = terrain.node();
      if (node) return node;
    }
    if (typeof document !== "undefined") {
      return document.getElementById("terrain");
    }
    return null;
  },
};

export function createClearReliefIconsTool(
  runtime: ClearReliefIconsRuntime = defaultClearReliefIconsRuntime,
): Tool {
  return {
    name: "clear_relief_icons",
    description:
      'Permanently removes relief icons (mountains, hills, trees, etc — `<use>` elements under `<g id="terrain">`) from the map. Mirrors the bulk-remove branch of the Edit Relief Icons dialog (`removeIcon` in `public/modules/ui/relief-editor.js`). Optional `type` filter: pass an icon type with the leading `#` (e.g. `"#relief-mount-1"`) to remove only that type, matching the legacy `terrain.selectAll("use[href=\'" + type + "\']")` selector. Omit `type` to remove every relief icon. Destructive: there is no undo. This is a DOM-only operation — relief icons are not mirrored in `pack` data. Returns `{ ok, type, removed_count }` where `type` echoes the input (or `null` if omitted) and `removed_count` is the number of `<use>` elements that were removed (0 if none matched — that is NOT an error).',
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            'Optional icon type to filter by, with leading "#" (e.g. "#relief-mount-1", "#relief-hill-2"). Matched verbatim against the `<use href="...">` attribute, mirroring the legacy editor\'s selector. Omit to remove ALL relief icons.',
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { type?: unknown };

      let type: string | null = null;
      if (input.type !== undefined) {
        if (typeof input.type !== "string") {
          return errorResult("type must be a string.");
        }
        if (!input.type.startsWith("#")) {
          return errorResult(
            "type must start with '#' (e.g. '#relief-mount-1').",
          );
        }
        type = input.type;
      }

      const root = runtime.getTerrainRoot();
      if (!root) {
        return errorResult(
          "Terrain layer is not available; the map hasn't finished loading.",
        );
      }

      const selector = type !== null ? `use[href="${type}"]` : "use";

      let matches: Element[];
      try {
        matches = Array.from(root.querySelectorAll(selector));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const removed_count = matches.length;
      for (const node of matches) {
        node.remove();
      }

      return okResult({ type, removed_count });
    },
  };
}

export const clearReliefIconsTool = createClearReliefIconsTool();
