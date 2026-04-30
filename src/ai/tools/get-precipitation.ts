import { getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import {
  PRECIPITATION_INPUT_ID,
  PRECIPITATION_OUTPUT_ID,
  PRECIPITATION_STORED_KEY,
} from "./set-precipitation";

export const PRECIPITATION_OPTION_KEY = "prec";

export interface PrecipitationSnapshot {
  value: number | null;
}

export interface PrecipitationReadRuntime {
  read(): PrecipitationSnapshot;
}

type PrecipitationOptions = Record<string, unknown>;

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

function readPrecipitation(): number | null {
  const options = getGlobal<PrecipitationOptions>("options");
  if (options) {
    const fromOptions = toFiniteNumber(options[PRECIPITATION_OPTION_KEY]);
    if (fromOptions !== null) return fromOptions;
  }
  if (typeof document !== "undefined") {
    const output = document.getElementById(
      PRECIPITATION_OUTPUT_ID,
    ) as HTMLInputElement | null;
    const fromOutput = parseFloatOrNull(output?.value);
    if (fromOutput !== null) return fromOutput;
    const input = document.getElementById(
      PRECIPITATION_INPUT_ID,
    ) as HTMLInputElement | null;
    const fromInput = parseFloatOrNull(input?.value);
    if (fromInput !== null) return fromInput;
  }
  if (typeof localStorage !== "undefined") {
    const fromStore = parseFloatOrNull(
      localStorage.getItem(PRECIPITATION_STORED_KEY),
    );
    if (fromStore !== null) return fromStore;
  }
  return null;
}

export const defaultPrecipitationReadRuntime: PrecipitationReadRuntime = {
  read(): PrecipitationSnapshot {
    return { value: readPrecipitation() };
  },
};

export function createGetPrecipitationTool(
  runtime: PrecipitationReadRuntime = defaultPrecipitationReadRuntime,
): Tool {
  return {
    name: "get_precipitation",
    description:
      "Read the current world precipitation rate (Options dialog's `Precipitation` slider) — the read-side inverse of `set_precipitation`. Reports a single `value` (percent, typically in [0, 500]; 100 is the default, higher = wetter). Resolves in order: `window.options.prec` when a finite number, then the paired `#precOutput` DOM element's value, then the paired `#precInput` DOM element's value, then `localStorage.getItem(\"prec\")` (matching the UI's `data-stored` persistence — the same surface `set_precipitation` writes to). Returns `{ ok, value }` where `value` is a number when a source resolves, or `null` when no source has a usable value (SSR / tests, or before the map has finished loading). Read-only — never mutates `window.options`, the DOM, or localStorage. Takes no parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const snapshot = runtime.read();
      return okResult({ value: snapshot.value });
    },
  };
}

export const getPrecipitationTool = createGetPrecipitationTool();
