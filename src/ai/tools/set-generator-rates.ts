import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface GeneratorField {
  optionKey: string;
  inputId: string;
  outputId: string | null;
  storedKey: string;
  min: number;
  max: number;
  integer: boolean;
}

export const GENERATOR_FIELDS: Record<string, GeneratorField> = {
  cultures: {
    optionKey: "cultures",
    inputId: "culturesInput",
    outputId: "culturesOutput",
    storedKey: "cultures",
    min: 1,
    max: 100,
    integer: true,
  },
  states_number: {
    optionKey: "statesNumber",
    inputId: "statesNumber",
    outputId: null,
    storedKey: "statesNumber",
    min: 0,
    max: 100,
    integer: true,
  },
  provinces_ratio: {
    optionKey: "provincesRatio",
    inputId: "provincesRatio",
    outputId: null,
    storedKey: "provincesRatio",
    min: 0,
    max: 100,
    integer: true,
  },
  size_variety: {
    optionKey: "sizeVariety",
    inputId: "sizeVariety",
    outputId: null,
    storedKey: "sizeVariety",
    min: 0,
    max: 10,
    integer: false,
  },
  growth_rate: {
    optionKey: "growthRate",
    inputId: "growthRate",
    outputId: null,
    storedKey: "growthRate",
    min: 0.1,
    max: 2,
    integer: false,
  },
  manors: {
    optionKey: "manors",
    inputId: "manorsInput",
    outputId: "manorsOutput",
    storedKey: "manors",
    min: 0,
    max: 1000,
    integer: true,
  },
  religions_number: {
    optionKey: "religionsNumber",
    inputId: "religionsNumber",
    outputId: null,
    storedKey: "religionsNumber",
    min: 0,
    max: 50,
    integer: true,
  },
};

type GeneratorOptions = Record<string, number>;

export interface GeneratorRatesRuntime {
  apply(field: GeneratorField, value: number): number | null;
}

export const defaultGeneratorRatesRuntime: GeneratorRatesRuntime = {
  apply(field, value) {
    const options = getGlobal<GeneratorOptions>("options");
    let previous: number | null = null;
    if (options) {
      const existing = options[field.optionKey];
      if (typeof existing === "number") previous = existing;
      options[field.optionKey] = value;
    }
    if (typeof document !== "undefined") {
      const asStr = String(value);
      const input = document.getElementById(
        field.inputId,
      ) as HTMLInputElement | null;
      if (input) input.value = asStr;
      if (field.outputId) {
        const output = document.getElementById(
          field.outputId,
        ) as HTMLInputElement | null;
        if (output) output.value = asStr;
      }
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(field.storedKey, String(value));
    }
    return previous;
  },
};

function validateValue(
  value: unknown,
  field: GeneratorField,
  name: string,
): string | number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${name} must be a finite number.`;
  }
  if (value < field.min || value > field.max) {
    return `${name} must be in the range [${field.min}, ${field.max}].`;
  }
  if (field.integer && !Number.isInteger(value)) {
    return `${name} must be an integer.`;
  }
  return value;
}

export function createSetGeneratorRatesTool(
  runtime: GeneratorRatesRuntime = defaultGeneratorRatesRuntime,
): Tool {
  const fieldNames = Object.keys(GENERATOR_FIELDS);
  return {
    name: "set_generator_rates",
    description:
      "Tune the Options dialog's generator-count sliders (passive — applied on next regenerate_map). Fields: `cultures` (int ≥ 1), `states_number` (int 0–100), `provinces_ratio` (int 0–100 %), `size_variety` (0–10, step 0.1), `growth_rate` (0.1–2, step 0.1), `manors` (int 0–1000; 1000 = auto), `religions_number` (int 0–50). At least one field required. Writes window.options, the corresponding Input/Output DOM elements, and localStorage — same side-effects as dragging the sliders.",
    input_schema: {
      type: "object",
      properties: {
        cultures: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Number of cultures to generate (≥ 1).",
        },
        states_number: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "Number of states to generate (0–100).",
        },
        provinces_ratio: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description:
            "Percentage of burgs that become province centers (0–100).",
        },
        size_variety: {
          type: "number",
          minimum: 0,
          maximum: 10,
          description: "Variance in state / culture size (expansionism); 0–10.",
        },
        growth_rate: {
          type: "number",
          minimum: 0.1,
          maximum: 2,
          description: "Expansion growth rate; 0.1–2.",
        },
        manors: {
          type: "integer",
          minimum: 0,
          maximum: 1000,
          description: "Burgs (non-capital settlements) number; 1000 = auto.",
        },
        religions_number: {
          type: "integer",
          minimum: 0,
          maximum: 50,
          description: "Number of organized religions to generate (0–50).",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;

      const provided: [string, number][] = [];
      for (const name of fieldNames) {
        const raw = input[name];
        if (raw === undefined || raw === null) continue;
        const field = GENERATOR_FIELDS[name];
        if (!field) continue;
        const validated = validateValue(raw, field, name);
        if (typeof validated === "string") {
          return errorResult(validated);
        }
        provided.push([name, validated]);
      }

      if (provided.length === 0) {
        return errorResult(
          `at least one of ${fieldNames.join(", ")} is required.`,
        );
      }

      const applied: Array<{
        name: string;
        previous: number | null;
        value: number;
      }> = [];
      try {
        for (const [name, value] of provided) {
          const field = GENERATOR_FIELDS[name];
          if (!field) continue;
          const previous = runtime.apply(field, value);
          applied.push({ name, previous, value });
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ applied });
    },
  };
}

export const setGeneratorRatesTool = createSetGeneratorRatesTool();
