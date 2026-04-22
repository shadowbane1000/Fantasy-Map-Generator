import { createAliasResolver, errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

type DistanceUnit = "mi" | "km" | "lg" | "vr" | "nmi" | "nlg";
type HeightUnit = "ft" | "m" | "f";
type TemperatureUnit = "°C" | "°F" | "K" | "°R" | "°De" | "°N" | "°Ré";

const DISTANCE_CANONICAL: readonly DistanceUnit[] = [
  "mi",
  "km",
  "lg",
  "vr",
  "nmi",
  "nlg",
];

const HEIGHT_CANONICAL: readonly HeightUnit[] = ["ft", "m", "f"];

const TEMPERATURE_CANONICAL: readonly TemperatureUnit[] = [
  "°C",
  "°F",
  "K",
  "°R",
  "°De",
  "°N",
  "°Ré",
];

const resolveDistance = createAliasResolver<DistanceUnit>(DISTANCE_CANONICAL, {
  mile: "mi",
  miles: "mi",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",
  league: "lg",
  leagues: "lg",
  versta: "vr",
  verstas: "vr",
  versts: "vr",
  verst: "vr",
  "nautical mile": "nmi",
  "nautical miles": "nmi",
  "nautical league": "nlg",
  "nautical leagues": "nlg",
});

const resolveHeight = createAliasResolver<HeightUnit>(HEIGHT_CANONICAL, {
  foot: "ft",
  feet: "ft",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  fathom: "f",
  fathoms: "f",
});

const resolveTemperature = createAliasResolver<TemperatureUnit>(
  TEMPERATURE_CANONICAL,
  {
    c: "°C",
    celsius: "°C",
    f: "°F",
    fahrenheit: "°F",
    k: "K",
    kelvin: "K",
    r: "°R",
    rankine: "°R",
    de: "°De",
    delisle: "°De",
    n: "°N",
    newton: "°N",
    ré: "°Ré",
    re: "°Ré",
    reaumur: "°Ré",
    réaumur: "°Ré",
  },
);

export function canonDistance(value: string): string {
  return resolveDistance(value) ?? value.trim();
}

export function canonHeight(value: string): string {
  return resolveHeight(value) ?? value.trim();
}

export function canonTemperature(value: string): string {
  return resolveTemperature(value) ?? value.trim();
}

export interface MeasurementUnitsRuntime {
  setUnit(elementId: string, storedKey: string, value: string): void;
}

export const defaultMeasurementUnitsRuntime: MeasurementUnitsRuntime = {
  setUnit(elementId: string, storedKey: string, value: string): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available.");
    }
    const el = document.getElementById(elementId) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (!el) {
      throw new Error(
        `#${elementId} is not available yet; wait for the Options panel to load.`,
      );
    }
    el.value = value;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storedKey, value);
    }
  },
};

type Applied = Record<string, string>;

function validateStringField(value: unknown, field: string): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return `${field}, if provided, must be a non-empty string.`;
  }
  return null;
}

export function createSetMeasurementUnitsTool(
  runtime: MeasurementUnitsRuntime = defaultMeasurementUnitsRuntime,
): Tool {
  return {
    name: "set_measurement_units",
    description:
      "Change the Options panel display units for distance, area, height, and temperature. Passive: affects how measurements are rendered next time. Writes each provided unit to its Options-panel element (distanceUnitInput / areaUnit / heightUnit / temperatureScale) and persists to localStorage, matching the UI's own change-handler. Common prose terms are canonicalized (miles → mi, feet → ft, celsius → °C, etc.); anything else is passed through as a custom label. Area is free-form (use 'square' to append ² to the distance unit).",
    input_schema: {
      type: "object",
      properties: {
        distance: {
          type: "string",
          description:
            "Distance unit. Canonical: mi, km, lg, vr, nmi, nlg. Prose aliases accepted.",
        },
        area: {
          type: "string",
          description:
            "Area unit label. Free-form; 'square' appends ² to the distance unit (default behaviour).",
        },
        height: {
          type: "string",
          description:
            "Height unit. Canonical: ft, m, f. Prose aliases accepted.",
        },
        temperature: {
          type: "string",
          description:
            "Temperature scale. Canonical: °C, °F, K, °R, °De, °N, °Ré. Prose aliases accepted.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        distance?: unknown;
        area?: unknown;
        height?: unknown;
        temperature?: unknown;
      };

      const hasDistance =
        input.distance !== undefined && input.distance !== null;
      const hasArea = input.area !== undefined && input.area !== null;
      const hasHeight = input.height !== undefined && input.height !== null;
      const hasTemperature =
        input.temperature !== undefined && input.temperature !== null;

      if (!hasDistance && !hasArea && !hasHeight && !hasTemperature) {
        return errorResult(
          "Provide at least one of: distance, area, height, temperature.",
        );
      }

      if (hasDistance) {
        const err = validateStringField(input.distance, "distance");
        if (err) return errorResult(err);
      }
      if (hasArea) {
        const err = validateStringField(input.area, "area");
        if (err) return errorResult(err);
      }
      if (hasHeight) {
        const err = validateStringField(input.height, "height");
        if (err) return errorResult(err);
      }
      if (hasTemperature) {
        const err = validateStringField(input.temperature, "temperature");
        if (err) return errorResult(err);
      }

      const applied: Applied = {};
      try {
        if (hasDistance) {
          applied.distance = canonDistance(input.distance as string);
          runtime.setUnit(
            "distanceUnitInput",
            "distanceUnit",
            applied.distance,
          );
        }
        if (hasArea) {
          applied.area = (input.area as string).trim();
          runtime.setUnit("areaUnit", "areaUnit", applied.area);
        }
        if (hasHeight) {
          applied.height = canonHeight(input.height as string);
          runtime.setUnit("heightUnit", "heightUnit", applied.height);
        }
        if (hasTemperature) {
          applied.temperature = canonTemperature(input.temperature as string);
          runtime.setUnit(
            "temperatureScale",
            "temperatureScale",
            applied.temperature,
          );
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult(applied);
    },
  };
}

export const setMeasurementUnitsTool = createSetMeasurementUnitsTool();
