import { getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { GENERATOR_FIELDS, type GeneratorField } from "./set-generator-rates";

export type GeneratorRatesSnapshot = Record<string, number | null>;

export interface GeneratorRatesReadRuntime {
  read(): GeneratorRatesSnapshot;
}

type GeneratorOptions = Record<string, unknown>;

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

function readField(field: GeneratorField): number | null {
  const options = getGlobal<GeneratorOptions>("options");
  if (options) {
    const fromOptions = toFiniteNumber(options[field.optionKey]);
    if (fromOptions !== null) return fromOptions;
  }
  if (typeof document !== "undefined") {
    const el = document.getElementById(
      field.inputId,
    ) as HTMLInputElement | null;
    const fromDom = parseFloatOrNull(el?.value);
    if (fromDom !== null) return fromDom;
  }
  if (typeof localStorage !== "undefined") {
    const fromStore = parseFloatOrNull(localStorage.getItem(field.storedKey));
    if (fromStore !== null) return fromStore;
  }
  return null;
}

export const defaultGeneratorRatesReadRuntime: GeneratorRatesReadRuntime = {
  read(): GeneratorRatesSnapshot {
    const snapshot: GeneratorRatesSnapshot = {};
    for (const [name, field] of Object.entries(GENERATOR_FIELDS)) {
      snapshot[name] = readField(field);
    }
    return snapshot;
  },
};

export function createGetGeneratorRatesTool(
  runtime: GeneratorRatesReadRuntime = defaultGeneratorRatesReadRuntime,
): Tool {
  return {
    name: "get_generator_rates",
    description:
      "Read the current Options-dialog generator-count slider values — inverse of `set_generator_rates`. Reports `cultures`, `states_number`, `provinces_ratio`, `size_variety`, `growth_rate`, `manors`, `religions_number`. Per field, reads `window.options[<optionKey>]` when finite, then the paired Input DOM element's value, then `localStorage.getItem(<storedKey>)` (matching the UI's persisted keys). Returns a number when the field resolves, or `null` if no source had a usable value. Takes no parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const snapshot = runtime.read();
      return okResult({ ...snapshot });
    },
  };
}

export const getGeneratorRatesTool = createGetGeneratorRatesTool();
