import {
  errorResult,
  findEntityByRef,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawProvince,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { isValidCssColor } from "./set-state-color";

export interface ProvinceColorRef {
  i: number;
  name: string;
  previousColor: string | null;
}

export interface ProvinceColorRuntime {
  find(ref: number | string): ProvinceColorRef | null;
  applyColor(i: number, color: string): void;
}

export const defaultProvinceColorRuntime: ProvinceColorRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawProvince>("provinces"),
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
    const provinces = getPackCollection<RawProvince>("provinces");
    const p = provinces?.[i];
    if (!p) throw new Error(`Province ${i} not found.`);
    if (p.removed) throw new Error(`Province ${i} has been removed.`);
    p.color = color;
    if (typeof document === "undefined") return;
    document.getElementById(`province${i}`)?.setAttribute("fill", color);
    document.getElementById(`province-gap${i}`)?.setAttribute("stroke", color);
  },
};

export function createSetProvinceColorTool(
  runtime: ProvinceColorRuntime = defaultProvinceColorRuntime,
): Tool {
  return {
    name: "set_province_color",
    description:
      "Change a specific province's display color. Updates pack.provinces[i].color and refreshes the province's SVG fill (#province{i}) and gap stroke (#province-gap{i}) — matching the Provinces Editor color-swatch behaviour. Accepts hex, rgb()/rgba()/hsl()/hsla(), and named CSS colors.",
    input_schema: {
      type: "object",
      properties: {
        province: {
          type: ["integer", "string"],
          description:
            "Numeric province id (> 0) or the province's current name or fullName.",
        },
        color: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or named color).",
        },
      },
      required: ["province", "color"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        province?: unknown;
        color?: unknown;
      };

      const refResult = parseEntityRef(input.province, "province");
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
          `No province found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot recolor province 0 (the placeholder entry).",
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

export const setProvinceColorTool = createSetProvinceColorTool();
