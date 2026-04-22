import {
  errorResult,
  findEntityByRef,
  getGlobal,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface StateColorRef {
  i: number;
  name: string;
  previousColor: string | null;
}

export interface StateColorRuntime {
  find(ref: number | string): StateColorRef | null;
  applyColor(i: number, color: string): void;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION_COLOR = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|color)\s*\([^)]+\)$/i;
const NAMED_COLOR = /^[a-z]{3,30}$/i;

export function isValidCssColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  if (HEX_COLOR.test(v)) return true;
  if (FUNCTION_COLOR.test(v)) return true;
  if (NAMED_COLOR.test(v)) return true;
  return false;
}

interface D3Color {
  darker(): { hex(): string };
  hex(): string;
}

interface D3Like {
  color(input: string): D3Color | null;
}

export const defaultStateColorRuntime: StateColorRuntime = {
  find(ref) {
    const entry = findEntityByRef(getPackCollection<RawState>("states"), ref);
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousColor: entry.color ?? null,
    };
  },
  applyColor(i: number, color: string): void {
    const states = getPackCollection<RawState>("states");
    const state = states?.[i];
    if (!state) throw new Error(`State ${i} not found.`);
    if (state.removed) throw new Error(`State ${i} has been removed.`);
    state.color = color;
    if (typeof document === "undefined") return;
    document.getElementById(`state${i}`)?.setAttribute("fill", color);
    document.getElementById(`state-gap${i}`)?.setAttribute("stroke", color);
    const borderEl = document.getElementById(`state-border${i}`);
    if (!borderEl) return;
    const d3 = getGlobal<D3Like>("d3");
    let halo = color;
    try {
      const c = d3?.color(color);
      if (c) halo = c.darker().hex();
    } catch {
      halo = color;
    }
    borderEl.setAttribute("stroke", halo);
  },
};

export function createSetStateColorTool(
  runtime: StateColorRuntime = defaultStateColorRuntime,
): Tool {
  return {
    name: "set_state_color",
    description:
      "Change a specific state's display color. Updates pack.states[i].color and the state's SVG fill, gap stroke, and border halo (to match the States Editor color-swatch behaviour). Accepts hex colors (#rgb, #rgba, #rrggbb, #rrggbbaa), functional colors (rgb(), rgba(), hsl(), hsla()), and common CSS named colors.",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: ["integer", "string"],
          description: "Numeric state id (> 0) or state's current name.",
        },
        color: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or a named color like 'red').",
        },
      },
      required: ["state", "color"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        state?: unknown;
        color?: unknown;
      };

      const refResult = parseEntityRef(input.state, "state");
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
          `No state found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot recolor state 0 (the Neutrals placeholder).",
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

export const setStateColorTool = createSetStateColorTool();
