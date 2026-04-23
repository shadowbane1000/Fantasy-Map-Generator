import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Remove a single ruler / opisometer / planimeter by numeric id —
 * same side-effect as the per-row remove button rendered next to each
 * measurer's label in `public/modules/ui/measurers.js`
 * (every subclass's `drawLabel` attaches
 * `el.on("click", () => rulers.remove(this.id))`).
 *
 * The legacy `Rulers.prototype.remove(id)` (measurers.js:44) does:
 *
 *   const ruler = this.data.find(ruler => ruler.id === id);
 *   ruler.undraw();                 // removes SVG el via this.el?.remove()
 *   const rulerIndex = this.data.indexOf(ruler);
 *   rulers.data.splice(rulerIndex, 1);
 *
 * We mirror that call but add:
 *  - An explicit "not found" error instead of the legacy crash on
 *    `undefined.undraw()`.
 *  - A try/catch so that a failing `ruler.undraw()` (e.g. a missing
 *    SVG element) doesn't prevent the data from being spliced out.
 *  - A best-effort DOM sweep for any leftover `#ruler{id}` child.
 *
 * Parallels `clear_rulers` (bulk) and `add_ruler` (create).
 */

interface MeasurerLike {
  id: number;
}

interface RulersLike {
  data: MeasurerLike[];
  remove: (id: number) => void;
}

export interface RulerRemovalRuntime {
  remove(id: number): { id: number };
}

export const defaultRulerRemovalRuntime: RulerRemovalRuntime = {
  remove(id: number): { id: number } {
    const rulers = getGlobal<RulersLike>("rulers");
    if (
      !rulers ||
      typeof rulers.remove !== "function" ||
      !Array.isArray(rulers.data)
    ) {
      throw new Error(
        "Rulers is not available yet; the map hasn't finished loading.",
      );
    }

    const existing = rulers.data.find((r) => r && r.id === id);
    if (!existing) {
      throw new Error(`Ruler ${id} not found.`);
    }

    try {
      rulers.remove(id);
    } catch {
      // Best-effort: legacy remove() may throw if the SVG element is
      // already gone. Still splice the data entry so the collection
      // stays consistent.
      const idx = rulers.data.indexOf(existing);
      if (idx !== -1) rulers.data.splice(idx, 1);
    }

    // Safety net: wipe any leftover `#ruler{id}` DOM node (the label
    // group that `ruler.draw()` created). `undraw()` usually handles
    // this via `this.el?.remove()`, but the safety net matches the
    // pattern used by `remove_marker` for robustness.
    if (typeof document !== "undefined") {
      document.getElementById(`ruler${id}`)?.remove();
    }

    return { id };
  },
};

function isFiniteInteger(v: unknown): v is number {
  return (
    typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0
  );
}

export function createRemoveRulerTool(
  runtime: RulerRemovalRuntime = defaultRulerRemovalRuntime,
): Tool {
  return {
    name: "remove_ruler",
    description:
      'Remove a single distance-measurement ruler / opisometer / planimeter by its numeric id — same side-effect as the per-row remove button next to each measurer label (every subclass of `Measurer` wires `el.on("click", () => rulers.remove(this.id))` in its `drawLabel`). Delegates to `window.rulers.remove(id)` from `public/modules/ui/measurers.js` (which calls the instance\'s `undraw()` to strip the SVG element, then splices `rulers.data`). Errors if no ruler exists with that id (unlike the legacy method, which would crash). Best-effort DOM sweep for the `#ruler{id}` group. Parallels `clear_rulers` (bulk) and `add_ruler` (create). Returns `{id}` (the removed ruler\'s id). Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description:
            "Numeric id of the ruler to remove (matches `ruler.id`, which the `Measurer` base class assigned as `rulers.data.length` at creation time — the first ruler has id 0). Must be a non-negative integer.",
          minimum: 0,
        },
      },
      required: ["id"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { id?: unknown };

      if (!isFiniteInteger(input.id)) {
        return errorResult(
          `id must be a non-negative finite integer. Got: ${JSON.stringify(input.id)}.`,
        );
      }

      try {
        const { id } = runtime.remove(input.id);
        return okResult({ id });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const removeRulerTool = createRemoveRulerTool();
