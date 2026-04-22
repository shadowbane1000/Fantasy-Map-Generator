import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { isValidCssColor } from "./set-state-color";

export interface ReligionColorRef {
  i: number;
  name: string;
  previousColor: string | null;
}

export interface ReligionColorRuntime {
  find(ref: number | string): ReligionColorRef | null;
  applyColor(i: number, color: string): void;
}

export const defaultReligionColorRuntime: ReligionColorRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawReligion>("religions"),
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
    const religions = getPackCollection<RawReligion>("religions");
    const r = religions?.[i];
    if (!r) throw new Error(`Religion ${i} not found.`);
    if (r.removed) throw new Error(`Religion ${i} has been removed.`);
    r.color = color;
    if (typeof document === "undefined") return;
    document.getElementById(`religion${i}`)?.setAttribute("fill", color);
    document.getElementById(`religionsCenter${i}`)?.setAttribute("fill", color);
  },
};

export function createSetReligionColorTool(
  runtime: ReligionColorRuntime = defaultReligionColorRuntime,
): Tool {
  return {
    name: "set_religion_color",
    description:
      "Change a specific religion's display color. Updates pack.religions[i].color and refreshes the religion's SVG fill (#religion{i}) and its center marker (#religionsCenter{i}) — matching the Religions Editor color-swatch behaviour. Accepts hex, rgb()/rgba()/hsl()/hsla(), and named CSS colors.",
    input_schema: {
      type: "object",
      properties: {
        religion: {
          type: ["integer", "string"],
          description: "Numeric religion id (> 0) or current name.",
        },
        color: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or named color).",
        },
      },
      required: ["religion", "color"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        religion?: unknown;
        color?: unknown;
      };

      const refResult = parseEntityRef(input.religion, "religion");
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
          `No religion found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot recolor religion 0 (the 'No religion' placeholder).",
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

export const setReligionColorTool = createSetReligionColorTool();
