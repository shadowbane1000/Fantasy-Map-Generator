import { getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  HEIGHT_EXPONENT_INPUT_ID,
  HEIGHT_EXPONENT_OPTION_KEY,
  HEIGHT_EXPONENT_STORED_KEY,
} from "./set-height-exponent";

export interface HeightExponentReadRuntime {
  read(): number | null;
}

type HeightExponentOptions = Record<string, unknown>;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parseFloatOrNull(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export const defaultHeightExponentReadRuntime: HeightExponentReadRuntime = {
  read(): number | null {
    const options = getGlobal<HeightExponentOptions>("options");
    if (options) {
      const fromOptions = toFiniteNumber(options[HEIGHT_EXPONENT_OPTION_KEY]);
      if (fromOptions !== null) return fromOptions;
    }
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        HEIGHT_EXPONENT_INPUT_ID,
      ) as HTMLInputElement | null;
      const fromDom = parseFloatOrNull(el?.value);
      if (fromDom !== null) return fromDom;
    }
    if (typeof localStorage !== "undefined") {
      const fromStore = parseFloatOrNull(
        localStorage.getItem(HEIGHT_EXPONENT_STORED_KEY),
      );
      if (fromStore !== null) return fromStore;
    }
    return null;
  },
};

export function createGetHeightExponentTool(
  runtime: HeightExponentReadRuntime = defaultHeightExponentReadRuntime,
): Tool {
  return {
    name: "get_height_exponent",
    description:
      "Read the current height-exponent setting — inverse of `set_height_exponent`. The Options panel's Exponent slider controls altitude-change sharpness on the next regenerate (lower = flatter, higher = more dramatic peaks; default 2; range [1.5, 2.2]). Reads `window.options.heightExponent` when finite, then the `#heightExponentInput` DOM element's value, then `localStorage.getItem(\"heightExponent\")` (matching the units-editor's persisted key). Returns `{ok, value}` — `value` is a number when any source resolves, or `null` if none had a usable value. Read-only — never mutates `window.options`, the DOM, or localStorage. Takes no parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const value = runtime.read();
      return okResult({ value });
    },
  };
}

export const getHeightExponentTool = createGetHeightExponentTool();
