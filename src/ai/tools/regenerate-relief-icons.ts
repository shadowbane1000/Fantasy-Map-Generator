import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Wipe and re-place every relief icon on the map by delegating to
 * `window.drawReliefIcons()` (the renderer in
 * `src/renderers/draw-relief-icons.ts`). Mirrors the side-effect of
 * the "Regenerate Relief Icons" button (`processFeatureRegeneration`
 * branch in `public/modules/ui/tools.js`) and the biome editor's
 * `regenerateIcons` (line 325 of `public/modules/ui/biomes-editor.js`),
 * MINUS the `if (!layerIsOn("toggleRelief")) toggleRelief()` follow-up.
 *
 * Layer-toggle is intentionally left out so the tool's effect is
 * narrow and predictable; the AI can call `set_layer_visibility` if
 * it wants the relief layer on.
 */

interface TerrainSelectionLike {
  /** D3 selection's underlying DOM node — the `<g id="terrain">`. */
  node?: () => Element | null;
}

export interface RegenerateReliefIconsRuntime {
  /**
   * Return the terrain SVG root element (`<g id="terrain">`) — the
   * container under which relief `<use>` icons live. Return `null`
   * when neither the `window.terrain` D3 selection nor the `#terrain`
   * SVG element is available (e.g. the map hasn't loaded yet).
   */
  getTerrainRoot(): Element | null;
  /**
   * Invoke `window.drawReliefIcons()`. Throws when the global is
   * missing or the renderer itself errors.
   */
  regenerate(): void;
}

export const defaultRegenerateReliefIconsRuntime: RegenerateReliefIconsRuntime =
  {
    getTerrainRoot(): Element | null {
      const sel = getGlobal<TerrainSelectionLike>("terrain");
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
    regenerate() {
      const fn = getGlobal<unknown>("drawReliefIcons");
      if (typeof fn !== "function") {
        throw new Error("window.drawReliefIcons is not available.");
      }
      (fn as () => void)();
    },
  };

function countUses(root: Element): number {
  return root.querySelectorAll("use").length;
}

export function createRegenerateReliefIconsTool(
  runtime: RegenerateReliefIconsRuntime = defaultRegenerateReliefIconsRuntime,
): Tool {
  return {
    name: "regenerate_relief_icons",
    description:
      'Wipe the existing relief icons (mountains, hills, trees, swamps, cacti, etc — `<use>` elements under `<g id="terrain">`) and procedurally re-place them based on the current heightmap and biome data. Delegates to `window.drawReliefIcons()` (defined in `src/renderers/draw-relief-icons.ts`), the same renderer the "Regenerate Relief Icons" button (`public/modules/ui/tools.js`) and the biome editor\'s `regenerateIcons` (`public/modules/ui/biomes-editor.js`) call. UNLIKE those legacy entry points, this tool does NOT auto-toggle the relief layer on — call `set_layer_visibility` separately if the layer needs to be visible. Takes no arguments. Returns `{ ok, count, previous_count }` where `previous_count` is the number of `<use>` icons present BEFORE the regenerate (captured before `drawReliefIcons` clears the terrain) and `count` is the number AFTER, so the caller can see the delta. Errors when the terrain SVG layer is unavailable or `window.drawReliefIcons` is not a function. Useful after biome / heightmap edits to refresh the relief overlay.',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const root = runtime.getTerrainRoot();
      if (!root) {
        return errorResult("terrain SVG layer is not available.");
      }

      const previous_count = countUses(root);

      try {
        runtime.regenerate();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      // Re-resolve so a renderer that swapped the terrain node would
      // still produce an accurate count.
      const after = runtime.getTerrainRoot() ?? root;
      const count = countUses(after);

      return okResult({ count, previous_count });
    },
  };
}

export const regenerateReliefIconsTool = createRegenerateReliefIconsTool();
