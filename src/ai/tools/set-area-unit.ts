import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const AREA_UNIT_INPUT_ID = "areaUnit";
export const AREA_UNIT_STORED_KEY = "areaUnit";
export const DISTANCE_UNIT_INPUT_ID = "distanceUnitInput";

export interface AreaUnitRuntime {
  getAreaUnit(): string | null;
  setAreaUnit(value: string): void;
  getDistanceUnit(): string | null;
  persist(key: string, value: string): void;
}

/**
 * Default runtime for `set_area_unit`. Mirrors the surfaces the units
 * editor (`public/modules/ui/units-editor.js`) writes to:
 *
 * - `<input id="areaUnit">` — the source of truth read by every editor
 *   (`zones-editor.js`, `provinces-editor.js`, `biomes-editor.js`,
 *   `save.js`, `export-json.js`).
 * - `localStorage["areaUnit"]` — persistence layer normally written by
 *   the change-handler `storeValueIfRequired` in
 *   `public/modules/ui/options.js`. Because we mutate `el.value`
 *   directly (no synthetic event), we explicitly call `setItem`.
 *
 * The persist call is best-effort — missing `localStorage` and a
 * throwing `setItem` (e.g. `QuotaExceededError`) are both swallowed.
 */
export const defaultAreaUnitRuntime: AreaUnitRuntime = {
  getAreaUnit(): string | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(
      AREA_UNIT_INPUT_ID,
    ) as HTMLInputElement | null;
    if (!el || typeof el.value !== "string") return null;
    return el.value;
  },
  setAreaUnit(value: string): void {
    if (typeof document === "undefined") {
      throw new Error(
        "#areaUnit input is not available; the units editor is not in the DOM.",
      );
    }
    const el = document.getElementById(
      AREA_UNIT_INPUT_ID,
    ) as HTMLInputElement | null;
    if (!el) {
      throw new Error(
        "#areaUnit input is not available; the units editor is not in the DOM.",
      );
    }
    el.value = value;
  },
  getDistanceUnit(): string | null {
    if (typeof document === "undefined") return null;
    const el = document.getElementById(
      DISTANCE_UNIT_INPUT_ID,
    ) as HTMLInputElement | null;
    if (!el || typeof el.value !== "string") return null;
    return el.value;
  },
  persist(key: string, value: string): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // best-effort: swallow QuotaExceededError, security errors, etc.
    }
  },
};

export function createSetAreaUnitTool(
  runtime: AreaUnitRuntime = defaultAreaUnitRuntime,
): Tool {
  return {
    name: "set_area_unit",
    description:
      'Set the displayed area unit — the value of `<input id="areaUnit">`. ' +
      'Use "square" for distance²-derived display (legacy editors render ' +
      '`distanceUnit + "²"`, e.g. mi²/km²); otherwise pass any literal ' +
      "label like 'ha', 'acre', 'km²', 'sq mi'. Writes the DOM input and " +
      'best-effort persists `localStorage["areaUnit"]`, mirroring the units ' +
      "editor. See `set_measurement_units` for the multi-field setter.",
    input_schema: {
      type: "object",
      properties: {
        unit: {
          type: "string",
          description:
            "Area unit label. Use 'square' for distance²-derived display (e.g. mi² / km²); otherwise any literal label like 'ha', 'acre', 'km²', 'sq mi'.",
        },
      },
      required: ["unit"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { unit?: unknown };
      const raw = input.unit;
      if (typeof raw !== "string" || !raw.trim()) {
        return errorResult("unit must be a non-empty string.");
      }
      const unit = raw;
      const previous = runtime.getAreaUnit();
      try {
        runtime.setAreaUnit(unit);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      runtime.persist(AREA_UNIT_STORED_KEY, unit);
      const interpreted_label =
        unit === "square" ? `${runtime.getDistanceUnit() ?? ""}²` : unit;
      return okResult({ previous, unit, interpreted_label });
    },
  };
}

export const setAreaUnitTool = createSetAreaUnitTool();
