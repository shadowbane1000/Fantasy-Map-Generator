import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

type TemperatureKey =
  | "temperatureEquator"
  | "temperatureNorthPole"
  | "temperatureSouthPole";

export interface ClimateField {
  optionKey: TemperatureKey | null;
  inputId: string;
  outputId: string;
  storedKey: string;
  min: number;
  max: number;
}

export const CLIMATE_FIELDS: Record<string, ClimateField> = {
  temperature_equator: {
    optionKey: "temperatureEquator",
    inputId: "temperatureEquatorInput",
    outputId: "temperatureEquatorOutput",
    storedKey: "temperatureEquator",
    min: -50,
    max: 50,
  },
  temperature_north_pole: {
    optionKey: "temperatureNorthPole",
    inputId: "temperatureNorthPoleInput",
    outputId: "temperatureNorthPoleOutput",
    storedKey: "temperatureNorthPole",
    min: -50,
    max: 50,
  },
  temperature_south_pole: {
    optionKey: "temperatureSouthPole",
    inputId: "temperatureSouthPoleInput",
    outputId: "temperatureSouthPoleOutput",
    storedKey: "temperatureSouthPole",
    min: -50,
    max: 50,
  },
  precipitation: {
    optionKey: null,
    inputId: "precInput",
    outputId: "precOutput",
    storedKey: "prec",
    min: 0,
    max: 500,
  },
};

type WindowOptions = Partial<Record<TemperatureKey, number>>;

export interface ClimateRuntime {
  apply(field: ClimateField, value: number): void;
}

export const defaultClimateRuntime: ClimateRuntime = {
  apply(field: ClimateField, value: number): void {
    if (field.optionKey) {
      const options = getGlobal<WindowOptions>("options");
      if (!options) {
        throw new Error("window.options is not available yet.");
      }
      options[field.optionKey] = value;
    }
    if (typeof document !== "undefined") {
      const asStr = String(value);
      const inputEl = document.getElementById(
        field.inputId,
      ) as HTMLInputElement | null;
      if (inputEl) inputEl.value = asStr;
      const outputEl = document.getElementById(
        field.outputId,
      ) as HTMLInputElement | null;
      if (outputEl) outputEl.value = asStr;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(field.storedKey, String(value));
    }
  },
};

function validateValue(
  value: unknown,
  field: ClimateField,
  name: string,
): number | string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < field.min ||
    value > field.max
  ) {
    return `${name} must be a finite number in [${field.min}, ${field.max}].`;
  }
  return value;
}

export function createSetClimateTool(
  runtime: ClimateRuntime = defaultClimateRuntime,
): Tool {
  return {
    name: "set_climate",
    description:
      "Tune the World Configurator's climate knobs. Passive: applied on the next regenerate_map. Any combination of `temperature_equator`, `temperature_north_pole`, `temperature_south_pole` (°C, all range [-50, 50]) and `precipitation` (%, [0, 500]). Writes window.options.temperatureX for the three temperature fields (precipitation lives only in the DOM), updates both paired input/output elements, and persists to localStorage — matching the UI's own change-handler.",
    input_schema: {
      type: "object",
      properties: {
        temperature_equator: {
          type: "number",
          minimum: -50,
          maximum: 50,
          description: "Temperature at the equator in °C.",
        },
        temperature_north_pole: {
          type: "number",
          minimum: -50,
          maximum: 50,
          description: "Temperature at the north pole in °C.",
        },
        temperature_south_pole: {
          type: "number",
          minimum: -50,
          maximum: 50,
          description: "Temperature at the south pole in °C.",
        },
        precipitation: {
          type: "number",
          minimum: 0,
          maximum: 500,
          description: "Precipitation percent. 100 is default.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      const keys = Object.keys(CLIMATE_FIELDS);
      const provided = keys.filter(
        (k) => input[k] !== undefined && input[k] !== null,
      );
      if (provided.length === 0) {
        return errorResult(`Provide at least one of: ${keys.join(", ")}.`);
      }

      const values: Record<string, number> = {};
      for (const name of provided) {
        const field = CLIMATE_FIELDS[name];
        if (!field) continue;
        const parsed = validateValue(input[name], field, name);
        if (typeof parsed === "string") return errorResult(parsed);
        values[name] = parsed;
      }

      const applied: Record<string, number> = {};
      try {
        for (const name of provided) {
          const field = CLIMATE_FIELDS[name];
          if (!field) continue;
          const v = values[name];
          if (typeof v !== "number") continue;
          runtime.apply(field, v);
          applied[name] = v;
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult(applied);
    },
  };
}

export const setClimateTool = createSetClimateTool();
