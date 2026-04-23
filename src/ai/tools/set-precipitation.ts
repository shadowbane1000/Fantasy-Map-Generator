import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const PRECIPITATION_MIN = 0;
export const PRECIPITATION_MAX = 500;
export const PRECIPITATION_INPUT_ID = "precInput";
export const PRECIPITATION_OUTPUT_ID = "precOutput";
export const PRECIPITATION_STORED_KEY = "prec";

export interface SetPrecipitationRuntime {
  read(): number | null;
  apply(value: number): void;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export const defaultSetPrecipitationRuntime: SetPrecipitationRuntime = {
  read(): number | null {
    if (typeof document !== "undefined") {
      const output = document.getElementById(
        PRECIPITATION_OUTPUT_ID,
      ) as HTMLInputElement | null;
      const fromOutput = parseNumber(output?.value);
      if (fromOutput !== null) return fromOutput;
      const input = document.getElementById(
        PRECIPITATION_INPUT_ID,
      ) as HTMLInputElement | null;
      const fromInput = parseNumber(input?.value);
      if (fromInput !== null) return fromInput;
    }
    if (typeof localStorage !== "undefined") {
      return parseNumber(localStorage.getItem(PRECIPITATION_STORED_KEY));
    }
    return null;
  },
  apply(value: number): void {
    const asStr = String(value);
    try {
      if (typeof document !== "undefined") {
        const inputEl = document.getElementById(
          PRECIPITATION_INPUT_ID,
        ) as HTMLInputElement | null;
        if (inputEl) inputEl.value = asStr;
        const outputEl = document.getElementById(
          PRECIPITATION_OUTPUT_ID,
        ) as HTMLInputElement | null;
        if (outputEl) outputEl.value = asStr;
      }
    } catch {
      // Best-effort DOM update — keep going so localStorage still lands.
    }
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available.");
    }
    localStorage.setItem(PRECIPITATION_STORED_KEY, asStr);
  },
};

export function createSetPrecipitationTool(
  runtime: SetPrecipitationRuntime = defaultSetPrecipitationRuntime,
): Tool {
  return {
    name: "set_precipitation",
    description:
      `Set the world precipitation rate (Options dialog's "Precipitation" slider). ` +
      `Percent value in [${PRECIPITATION_MIN}, ${PRECIPITATION_MAX}]; 100 is the default, higher ` +
      `produces more rivers and wetter biomes. Passive: takes effect on the next ` +
      `regenerate_map — precipitation feeds per-cell \`prec\` which drives river and ` +
      `biome generation. Mirrors the UI's own change-handler: writes the paired ` +
      `#precInput + #precOutput DOM elements and persists to localStorage["prec"]. ` +
      `(The value does not live on window.options — this matches set_climate.) ` +
      `Returns {previousValue, value}.`,
    input_schema: {
      type: "object",
      properties: {
        value: {
          type: "number",
          minimum: PRECIPITATION_MIN,
          maximum: PRECIPITATION_MAX,
          description: `Precipitation percent in [${PRECIPITATION_MIN}, ${PRECIPITATION_MAX}]. 100 is the default.`,
        },
      },
      required: ["value"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { value?: unknown };
      const value = input.value;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < PRECIPITATION_MIN ||
        value > PRECIPITATION_MAX
      ) {
        return errorResult(
          `value must be a finite number in [${PRECIPITATION_MIN}, ${PRECIPITATION_MAX}].`,
        );
      }

      const previousValue = runtime.read();

      try {
        runtime.apply(value);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ previousValue, value });
    },
  };
}

export const setPrecipitationTool = createSetPrecipitationTool();
