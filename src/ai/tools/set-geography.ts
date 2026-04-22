import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface GeographyField {
  inputId: string;
  outputId: string;
  storedKey: string;
  min: number;
  max: number;
}

export const GEOGRAPHY_FIELDS: Record<string, GeographyField> = {
  map_size: {
    inputId: "mapSizeInput",
    outputId: "mapSizeOutput",
    storedKey: "mapSize",
    min: 1,
    max: 100,
  },
  latitude: {
    inputId: "latitudeInput",
    outputId: "latitudeOutput",
    storedKey: "latitude",
    min: 0,
    max: 100,
  },
  longitude: {
    inputId: "longitudeInput",
    outputId: "longitudeOutput",
    storedKey: "longitude",
    min: 0,
    max: 100,
  },
};

export interface GeographyRuntime {
  apply(field: GeographyField, value: number): void;
}

export const defaultGeographyRuntime: GeographyRuntime = {
  apply(field: GeographyField, value: number): void {
    const asStr = String(value);
    if (typeof document !== "undefined") {
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
      localStorage.setItem(field.storedKey, asStr);
    }
  },
};

function validateValue(
  value: unknown,
  field: GeographyField,
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

export function createSetGeographyTool(
  runtime: GeographyRuntime = defaultGeographyRuntime,
): Tool {
  return {
    name: "set_geography",
    description:
      "Tune the World Configurator's geographic framing knobs. Passive: applied on the next regenerate_map. Any combination of map_size (%, [1, 100] — what fraction of the world this map covers), latitude (0 = north pole, 50 = equator, 100 = south pole), longitude (0 = west, 50 = prime meridian, 100 = east). Writes both paired Input + Output elements and localStorage — same side-effects as dragging the sliders.",
    input_schema: {
      type: "object",
      properties: {
        map_size: {
          type: "number",
          minimum: 1,
          maximum: 100,
          description:
            "Map size as a percentage of the world's surface. 100 = whole world.",
        },
        latitude: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description:
            "North-south shift. 0 = north pole, 50 = equator, 100 = south pole.",
        },
        longitude: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description:
            "East-west shift. 0 = west, 50 = prime meridian, 100 = east.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      const keys = Object.keys(GEOGRAPHY_FIELDS);
      const provided = keys.filter(
        (k) => input[k] !== undefined && input[k] !== null,
      );
      if (provided.length === 0) {
        return errorResult(`Provide at least one of: ${keys.join(", ")}.`);
      }

      const values: Record<string, number> = {};
      for (const name of provided) {
        const field = GEOGRAPHY_FIELDS[name];
        if (!field) continue;
        const parsed = validateValue(input[name], field, name);
        if (typeof parsed === "string") return errorResult(parsed);
        values[name] = parsed;
      }

      const applied: Record<string, number> = {};
      try {
        for (const name of provided) {
          const field = GEOGRAPHY_FIELDS[name];
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

export const setGeographyTool = createSetGeographyTool();
