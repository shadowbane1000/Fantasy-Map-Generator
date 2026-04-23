import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Clear all placed rulers — same side-effect as the Units Editor's
 * "Remove all rulers" dialog in `public/modules/ui/units-editor.js`
 * (`removeAllRulers`), which runs:
 *
 *   rulers.undraw();
 *   rulers = new Rulers();
 *
 * The legacy UI rebinds the `let rulers` in `public/main.js:145`; we
 * can't reassign a `let` binding across script contexts, so we mutate
 * the existing instance in place: call `.undraw()` (which removes each
 * ruler's SVG element via `Measurer.undraw() → this.el?.remove()`),
 * then empty `rulers.data`. As a safety net we also wipe any leftover
 * children of the `#ruler` SVG group (`Rulers.fromString` can rebuild
 * `.data` without drawing until the next `draw()` call, so there can
 * legitimately be un-tracked ruler DOM on a freshly loaded map).
 *
 * `cleared` is sourced from `rulers.data.length` before mutation.
 */

interface RulersLike {
  data: Array<unknown> & { length: number };
  undraw: () => void;
}

export interface ClearRulersRuntime {
  clearAll(): { cleared: number };
}

export const defaultClearRulersRuntime: ClearRulersRuntime = {
  clearAll(): { cleared: number } {
    const rulers = getGlobal<RulersLike>("rulers");
    if (
      !rulers ||
      typeof rulers.undraw !== "function" ||
      !Array.isArray(rulers.data)
    ) {
      throw new Error(
        "Rulers is not available yet; the map hasn't finished loading.",
      );
    }

    const cleared = rulers.data.length;

    try {
      rulers.undraw();
    } catch {
      // Best-effort: individual ruler.undraw() failures shouldn't
      // block clearing the collection.
    }

    rulers.data.length = 0;

    // Safety net: wipe any un-tracked ruler DOM (e.g. after
    // Rulers.fromString() ran but rulers.draw() hasn't yet).
    if (typeof document !== "undefined") {
      const group = document.getElementById("ruler");
      if (group) {
        while (group.firstChild) group.removeChild(group.firstChild);
      }
    }

    return { cleared };
  },
};

export function createClearRulersTool(
  runtime: ClearRulersRuntime = defaultClearRulersRuntime,
): Tool {
  return {
    name: "clear_rulers",
    description:
      'Remove every distance-measurement ruler / opisometer / planimeter currently placed on the map — same side-effect as the Units Editor\'s "Remove all rulers" dialog (`removeAllRulers` in `public/modules/ui/units-editor.js`). Calls `rulers.undraw()` (each measurer removes its own SVG element via `this.el?.remove()`), empties `rulers.data` in place, and best-effort wipes any remaining children in the `#ruler` SVG group. Idempotent — reports `cleared: 0` when there were no rulers. No parameters. Returns `{ cleared }` (the number of ruler entries removed). Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      try {
        const { cleared } = runtime.clearAll();
        return okResult({ cleared });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const clearRulersTool = createClearRulersTool();
