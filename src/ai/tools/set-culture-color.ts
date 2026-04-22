import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { isValidCssColor } from "./set-state-color";

export interface CultureColorRef {
  i: number;
  name: string;
  previousColor: string | null;
}

export interface CultureColorRuntime {
  find(ref: number | string): CultureColorRef | null;
  applyColor(i: number, color: string): void;
}

export const defaultCultureColorRuntime: CultureColorRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousColor: entry.color ?? null,
    };
  },
  applyColor(i: number, color: string): void {
    const cultures = getPackCollection<RawCulture>("cultures");
    const c = cultures?.[i];
    if (!c) throw new Error(`Culture ${i} not found.`);
    if (c.removed) throw new Error(`Culture ${i} has been removed.`);
    c.color = color;
    if (typeof document === "undefined") return;
    document.getElementById(`culture${i}`)?.setAttribute("fill", color);
    document.getElementById(`cultureCenter${i}`)?.setAttribute("fill", color);
  },
};

export function createSetCultureColorTool(
  runtime: CultureColorRuntime = defaultCultureColorRuntime,
): Tool {
  return {
    name: "set_culture_color",
    description:
      "Change a specific culture's display color. Updates pack.cultures[i].color and refreshes the culture's SVG fill (#culture{i}) and its center marker (#cultureCenter{i}) — matching the Cultures Editor color-swatch behaviour. Accepts hex, rgb()/rgba()/hsl()/hsla(), and named CSS colors.",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description: "Numeric culture id (> 0) or current name.",
        },
        color: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or named color).",
        },
      },
      required: ["culture", "color"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        culture?: unknown;
        color?: unknown;
      };

      const refResult = parseEntityRef(input.culture, "culture");
      if (!refResult.ok) return errorResult(refResult.error);
      if (!isValidCssColor(input.color)) {
        return errorResult(
          "color must be a valid CSS color (#hex, rgb(), rgba(), hsl(), hsla(), or a named color).",
        );
      }

      const color = input.color.trim();
      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No culture found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot recolor culture 0 (the Wildlands placeholder).",
        );
      }

      try {
        runtime.applyColor(current.i, color);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousColor: current.previousColor,
        color,
      });
    },
  };
}

export const setCultureColorTool = createSetCultureColorTool();
