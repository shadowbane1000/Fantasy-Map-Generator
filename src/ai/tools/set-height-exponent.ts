import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

const MIN_EXPONENT = 1.5;
const MAX_EXPONENT = 2.2;

export interface HeightExponentRuntime {
  apply(value: number): void;
}

export const defaultHeightExponentRuntime: HeightExponentRuntime = {
  apply(value: number): void {
    const asStr = String(value);
    if (typeof document !== "undefined") {
      const el = document.getElementById(
        "heightExponentInput",
      ) as HTMLInputElement | null;
      if (el) el.value = asStr;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("heightExponent", asStr);
    }
  },
};

export function createSetHeightExponentTool(
  runtime: HeightExponentRuntime = defaultHeightExponentRuntime,
): Tool {
  return {
    name: "set_height_exponent",
    description: `Adjust the altitude-change sharpness — the Options panel's Exponent slider. Number in [${MIN_EXPONENT}, ${MAX_EXPONENT}]; default 2. Lower values flatten terrain, higher values exaggerate peaks. Affects temperature and biomes. Passive: applied on the next regenerate_map. Writes #heightExponentInput.value and localStorage, matching the UI's own persistence.`,
    input_schema: {
      type: "object",
      properties: {
        value: {
          type: "number",
          minimum: MIN_EXPONENT,
          maximum: MAX_EXPONENT,
          description: `Height exponent in [${MIN_EXPONENT}, ${MAX_EXPONENT}].`,
        },
      },
      required: ["value"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { value?: unknown };
      const v = input.value;
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < MIN_EXPONENT ||
        v > MAX_EXPONENT
      ) {
        return errorResult(
          `value must be a finite number in [${MIN_EXPONENT}, ${MAX_EXPONENT}].`,
        );
      }
      try {
        runtime.apply(v);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      return okResult({ heightExponent: v });
    },
  };
}

export const setHeightExponentTool = createSetHeightExponentTool();
