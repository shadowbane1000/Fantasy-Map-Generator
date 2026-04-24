import { getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { CLIMATE_FIELDS, type ClimateField } from "./set-climate";

export interface ClimateSnapshot {
  temperatureEquator: number | null;
  temperatureNorthPole: number | null;
  temperatureSouthPole: number | null;
}

export interface ClimateReadRuntime {
  read(): ClimateSnapshot;
}

type TemperatureOptions = Partial<
  Record<
    "temperatureEquator" | "temperatureNorthPole" | "temperatureSouthPole",
    unknown
  >
>;

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

function readField(field: ClimateField): number | null {
  if (field.optionKey) {
    const options = getGlobal<TemperatureOptions>("options");
    if (options) {
      const fromOptions = toFiniteNumber(options[field.optionKey]);
      if (fromOptions !== null) return fromOptions;
    }
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

export const defaultClimateReadRuntime: ClimateReadRuntime = {
  read(): ClimateSnapshot {
    const equator = CLIMATE_FIELDS.temperature_equator;
    const north = CLIMATE_FIELDS.temperature_north_pole;
    const south = CLIMATE_FIELDS.temperature_south_pole;
    return {
      temperatureEquator: equator ? readField(equator) : null,
      temperatureNorthPole: north ? readField(north) : null,
      temperatureSouthPole: south ? readField(south) : null,
    };
  },
};

export function createGetClimateTool(
  runtime: ClimateReadRuntime = defaultClimateReadRuntime,
): Tool {
  return {
    name: "get_climate",
    description:
      "Read the current World Configurator climate-slider values — `temperature_equator`, `temperature_north_pole`, `temperature_south_pole` (all °C). Inverse of `set_climate`: per field, reads `window.options.*` when present, falls back to the paired input DOM element's value, then to localStorage (matching the stored-key the UI persists). Returns numbers for fields that resolve, or `null` for fields with no available source. Precipitation is intentionally excluded (covered by its own tool pair).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const snapshot = runtime.read();
      return okResult({
        temperature_equator: snapshot.temperatureEquator,
        temperature_north_pole: snapshot.temperatureNorthPole,
        temperature_south_pole: snapshot.temperatureSouthPole,
      });
    },
  };
}

export const getClimateTool = createGetClimateTool();
