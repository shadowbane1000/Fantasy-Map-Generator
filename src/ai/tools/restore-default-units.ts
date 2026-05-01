import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * DOM input ids for the nine fields the Units editor exposes. Mirrors
 * the legacy `restoreDefaultUnits` in
 * `public/modules/ui/units-editor.js` lines 88-120.
 */
export const DISTANCE_SCALE_INPUT_ID = "distanceScaleInput";
export const DISTANCE_UNIT_INPUT_ID = "distanceUnitInput";
export const HEIGHT_UNIT_INPUT_ID = "heightUnit";
export const TEMPERATURE_SCALE_INPUT_ID = "temperatureScale";
export const AREA_UNIT_INPUT_ID = "areaUnit";
export const HEIGHT_EXPONENT_INPUT_ID = "heightExponentInput";
export const POPULATION_RATE_INPUT_ID = "populationRateInput";
export const URBANIZATION_INPUT_ID = "urbanizationInput";
export const URBAN_DENSITY_INPUT_ID = "urbanDensityInput";

/**
 * The eight `localStorage` keys cleared by the legacy
 * `restoreDefaultUnits`. `distanceScale` is intentionally absent —
 * the legacy code calls `unlock("distanceScale")` instead, mirrored
 * in the side-effect list below.
 */
export const STORAGE_KEYS = [
  "distanceUnit",
  "heightUnit",
  "temperatureScale",
  "areaUnit",
  "heightExponent",
  "populationRate",
  "urbanization",
  "urbanDensity",
] as const;

/**
 * Side-effect callback names invoked after the field reset. Matches
 * the legacy ordering in `restoreDefaultUnits`. `unlock` takes the
 * literal string `"distanceScale"` as its sole argument; the other
 * three take no arguments.
 */
export const SIDE_EFFECT_NAMES = [
  "unlock",
  "calculateFriendlyGridSize",
  "calculateTemperatures",
  "renderScaleBar",
] as const;

/**
 * Canonical metric defaults applied by the tool. The legacy code
 * branches on `navigator.language` to give en-US / en-GB users
 * imperial defaults; the AI tool always returns metric and lets the
 * caller invoke `set_measurement_units` afterwards if it wants
 * imperial.
 */
export const DEFAULT_UNITS = {
  distanceScale: 3,
  distanceUnit: "km",
  heightUnit: "m",
  temperatureScale: "°C",
  areaUnit: "square",
  heightExponent: 1.8,
  populationRate: 1000,
  urbanization: 1,
  urbanDensity: 10,
} as const;

export interface RestoreDefaultUnitsApplied {
  distanceScale: number;
  distanceUnit: string;
  heightUnit: string;
  temperatureScale: string;
  areaUnit: string;
  heightExponent: number;
  populationRate: number;
  urbanization: number;
  urbanDensity: number;
}

export interface RestoreDefaultUnitsPrevious {
  distanceScale: number | null;
  distanceUnit: string | null;
  heightUnit: string | null;
  temperatureScale: string | null;
  areaUnit: string | null;
  heightExponent: number | null;
  populationRate: number | null;
  urbanization: number | null;
  urbanDensity: number | null;
}

export interface RestoreDefaultUnitsResult {
  previous: RestoreDefaultUnitsPrevious;
  applied: RestoreDefaultUnitsApplied;
  side_effects_run: string[];
}

/**
 * Generic per-field runtime seam. The default implementation reads /
 * writes `document.getElementById(id).value`, `globalThis[name]`, and
 * `localStorage.removeItem(key)` directly. Tests inject a stub to
 * exercise the call ordering and best-effort semantics in isolation.
 */
export interface RestoreDefaultUnitsRuntime {
  /** Read `document.getElementById(id)?.value` as a string, or null. */
  getDom(id: string): string | null;
  /** Best-effort write `document.getElementById(id).value = value`. */
  setDom(id: string, value: string): void;
  /** Read `globalThis[name]`. */
  getGlobal(name: string): unknown;
  /** Reassign `globalThis[name] = value`. */
  setGlobal(name: string, value: unknown): void;
  /** Best-effort `localStorage.removeItem(key)`. */
  removeStorage(key: string): void;
  /**
   * Best-effort invoke `globalThis[name](...args)`. Returns true iff
   * the global was a function and the call did not throw. Returns
   * false if missing or threw.
   */
  callIfPresent(name: string, ...args: unknown[]): boolean;
}

export const defaultRestoreDefaultUnitsRuntime: RestoreDefaultUnitsRuntime = {
  getDom(id: string): string | null {
    if (typeof document === "undefined") return null;
    try {
      const el = document.getElementById(id) as { value?: unknown } | null;
      if (!el) return null;
      const v = el.value;
      return typeof v === "string" ? v : null;
    } catch {
      return null;
    }
  },
  setDom(id: string, value: string): void {
    if (typeof document === "undefined") return;
    try {
      const el = document.getElementById(id) as { value?: unknown } | null;
      if (el) (el as { value: unknown }).value = value;
    } catch {
      // best-effort
    }
  },
  getGlobal(name: string): unknown {
    return getGlobal<unknown>(name);
  },
  setGlobal(name: string, value: unknown): void {
    (globalThis as Record<string, unknown>)[name] = value;
  },
  removeStorage(key: string): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(key);
    } catch {
      // best-effort: swallow security / quota errors
    }
  },
  callIfPresent(name: string, ...args: unknown[]): boolean {
    const fn = getGlobal<unknown>(name);
    if (typeof fn !== "function") return false;
    try {
      (fn as (...a: unknown[]) => unknown)(...args);
      return true;
    } catch {
      return false;
    }
  },
};

function parseNumberOrNull(s: string | null): number | null {
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function readNumberGlobal(
  runtime: RestoreDefaultUnitsRuntime,
  name: string,
): number | null {
  const v = runtime.getGlobal(name);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function createRestoreDefaultUnitsTool(
  runtime: RestoreDefaultUnitsRuntime = defaultRestoreDefaultUnitsRuntime,
): Tool {
  return {
    name: "restore_default_units",
    description:
      'Reset every measurement unit, scale, and rate to its METRIC default — same side-effect as the Restore button in the Units editor (units-editor.js → restoreDefaultUnits). Sets distanceScale=3, distanceUnit=km, heightUnit=m, temperatureScale=°C, areaUnit=square, heightExponent=1.8, populationRate=1000, urbanization=1, urbanDensity=10; reassigns the four globalThis-backed values (distanceScale / populationRate / urbanization / urbanDensity); writes the corresponding DOM input values; clears the eight localStorage entries (distanceUnit, heightUnit, temperatureScale, areaUnit, heightExponent, populationRate, urbanization, urbanDensity); and best-effort calls unlock("distanceScale"), calculateFriendlyGridSize(), calculateTemperatures(), renderScaleBar(). Always METRIC — call set_measurement_units afterwards if you want imperial. Takes no arguments. Returns the previous values (per field, null when missing), the applied defaults, and the list of side-effect callbacks that actually ran.',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      try {
        // ──────── snapshot phase (BEFORE any mutation) ────────
        const previous: RestoreDefaultUnitsPrevious = {
          distanceScale: readNumberGlobal(runtime, "distanceScale"),
          distanceUnit: runtime.getDom(DISTANCE_UNIT_INPUT_ID),
          heightUnit: runtime.getDom(HEIGHT_UNIT_INPUT_ID),
          temperatureScale: runtime.getDom(TEMPERATURE_SCALE_INPUT_ID),
          areaUnit: runtime.getDom(AREA_UNIT_INPUT_ID),
          heightExponent: parseNumberOrNull(
            runtime.getDom(HEIGHT_EXPONENT_INPUT_ID),
          ),
          populationRate: readNumberGlobal(runtime, "populationRate"),
          urbanization: readNumberGlobal(runtime, "urbanization"),
          urbanDensity: readNumberGlobal(runtime, "urbanDensity"),
        };

        // ──────── mutation phase ────────
        // 1. distanceScale (global + DOM)
        runtime.setGlobal("distanceScale", DEFAULT_UNITS.distanceScale);
        runtime.setDom(
          DISTANCE_SCALE_INPUT_ID,
          String(DEFAULT_UNITS.distanceScale),
        );

        // 2-5. unit DOM inputs
        runtime.setDom(DISTANCE_UNIT_INPUT_ID, DEFAULT_UNITS.distanceUnit);
        runtime.setDom(HEIGHT_UNIT_INPUT_ID, DEFAULT_UNITS.heightUnit);
        runtime.setDom(
          TEMPERATURE_SCALE_INPUT_ID,
          DEFAULT_UNITS.temperatureScale,
        );
        runtime.setDom(AREA_UNIT_INPUT_ID, DEFAULT_UNITS.areaUnit);

        // 6. heightExponent DOM
        runtime.setDom(
          HEIGHT_EXPONENT_INPUT_ID,
          String(DEFAULT_UNITS.heightExponent),
        );

        // 7-9. population rates (global + DOM)
        runtime.setGlobal("populationRate", DEFAULT_UNITS.populationRate);
        runtime.setDom(
          POPULATION_RATE_INPUT_ID,
          String(DEFAULT_UNITS.populationRate),
        );
        runtime.setGlobal("urbanization", DEFAULT_UNITS.urbanization);
        runtime.setDom(
          URBANIZATION_INPUT_ID,
          String(DEFAULT_UNITS.urbanization),
        );
        runtime.setGlobal("urbanDensity", DEFAULT_UNITS.urbanDensity);
        runtime.setDom(
          URBAN_DENSITY_INPUT_ID,
          String(DEFAULT_UNITS.urbanDensity),
        );

        // ──────── localStorage cleanup (best-effort, belt-and-suspenders) ────────
        for (const key of STORAGE_KEYS) {
          try {
            runtime.removeStorage(key);
          } catch {
            // default runtime already wraps; this guard handles a
            // custom runtime stub that throws.
          }
        }

        // ──────── side-effect callbacks (best-effort) ────────
        const side_effects_run: string[] = [];
        if (runtime.callIfPresent("unlock", "distanceScale")) {
          side_effects_run.push("unlock");
        }
        if (runtime.callIfPresent("calculateFriendlyGridSize")) {
          side_effects_run.push("calculateFriendlyGridSize");
        }
        if (runtime.callIfPresent("calculateTemperatures")) {
          side_effects_run.push("calculateTemperatures");
        }
        if (runtime.callIfPresent("renderScaleBar")) {
          side_effects_run.push("renderScaleBar");
        }

        const applied: RestoreDefaultUnitsApplied = {
          distanceScale: DEFAULT_UNITS.distanceScale,
          distanceUnit: DEFAULT_UNITS.distanceUnit,
          heightUnit: DEFAULT_UNITS.heightUnit,
          temperatureScale: DEFAULT_UNITS.temperatureScale,
          areaUnit: DEFAULT_UNITS.areaUnit,
          heightExponent: DEFAULT_UNITS.heightExponent,
          populationRate: DEFAULT_UNITS.populationRate,
          urbanization: DEFAULT_UNITS.urbanization,
          urbanDensity: DEFAULT_UNITS.urbanDensity,
        };

        return okResult({ previous, applied, side_effects_run });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const restoreDefaultUnitsTool = createRestoreDefaultUnitsTool();
