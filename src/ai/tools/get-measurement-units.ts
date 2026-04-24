import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface MeasurementUnitsReadRuntime {
  readUnit(elementId: string, storedKey: string): string | null;
}

// Read side of `MeasurementUnitsRuntime` in `set-measurement-units.ts`.
// Prefer the Options-panel input's current `.value`; fall back to the
// `localStorage` entry the UI persists alongside each element; finally return
// `null` when neither is available (SSR / pre-mount / cleared storage).
export const defaultMeasurementUnitsReadRuntime: MeasurementUnitsReadRuntime = {
  readUnit(elementId: string, storedKey: string): string | null {
    if (typeof document !== "undefined") {
      const el = document.getElementById(elementId) as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      if (el && typeof el.value === "string" && el.value !== "") {
        return el.value;
      }
    }
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(storedKey);
      if (stored !== null && stored !== "") return stored;
    }
    return null;
  },
};

export function createGetMeasurementUnitsTool(
  runtime: MeasurementUnitsReadRuntime = defaultMeasurementUnitsReadRuntime,
): Tool {
  return {
    name: "get_measurement_units",
    description:
      "Read the current Options-panel display units for distance, area, " +
      "height, and temperature — the read-side inverse of " +
      "`set_measurement_units`. Reads the same four surfaces the setter " +
      "writes: `#distanceUnitInput` / `localStorage['distanceUnit']`, " +
      "`#areaUnit` / `localStorage['areaUnit']`, `#heightUnit` / " +
      "`localStorage['heightUnit']`, `#temperatureScale` / " +
      "`localStorage['temperatureScale']`. DOM input value wins; the " +
      "matching `localStorage` entry is the fallback; `null` is reported " +
      "for any field that is available in neither (pre-mount / SSR / " +
      "cleared storage). Accepts no arguments. Read-only — never touches " +
      "the DOM, `window.options`, or `localStorage`. Returns `{ok, units: " +
      "{distance, area, height, temperature}}` whose shape mirrors what " +
      "`set_measurement_units` accepts.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const units = {
        distance: runtime.readUnit("distanceUnitInput", "distanceUnit"),
        area: runtime.readUnit("areaUnit", "areaUnit"),
        height: runtime.readUnit("heightUnit", "heightUnit"),
        temperature: runtime.readUnit("temperatureScale", "temperatureScale"),
      };
      return okResult({ units });
    },
  };
}

export const getMeasurementUnitsTool = createGetMeasurementUnitsTool();
