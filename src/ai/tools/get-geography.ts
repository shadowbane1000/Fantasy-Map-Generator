import { okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { GEOGRAPHY_FIELDS, type GeographyField } from "./set-geography";

export interface GeographySnapshot {
  mapSize: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface GeographyReadRuntime {
  read(): GeographySnapshot;
}

function parseFloatOrNull(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function readField(field: GeographyField): number | null {
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

export const defaultGeographyReadRuntime: GeographyReadRuntime = {
  read(): GeographySnapshot {
    const mapSize = GEOGRAPHY_FIELDS.map_size;
    const latitude = GEOGRAPHY_FIELDS.latitude;
    const longitude = GEOGRAPHY_FIELDS.longitude;
    return {
      mapSize: mapSize ? readField(mapSize) : null,
      latitude: latitude ? readField(latitude) : null,
      longitude: longitude ? readField(longitude) : null,
    };
  },
};

export function createGetGeographyTool(
  runtime: GeographyReadRuntime = defaultGeographyReadRuntime,
): Tool {
  return {
    name: "get_geography",
    description:
      "Read the current World Configurator geographic-framing slider values — `map_size` (%, [1, 100] — what fraction of the world this map covers), `latitude` (0 = north pole, 50 = equator, 100 = south pole), `longitude` (0 = west, 50 = prime meridian, 100 = east). Inverse of `set_geography`: per field, reads the paired input DOM element's value, then falls back to localStorage (matching the stored-key the UI persists). Unlike `set_climate` there is no `window.options` surface — the geography sliders live only in the DOM + localStorage. Returns numbers for fields that resolve, or `null` for fields with no available source. Takes no parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const snapshot = runtime.read();
      return okResult({
        map_size: snapshot.mapSize,
        latitude: snapshot.latitude,
        longitude: snapshot.longitude,
      });
    },
  };
}

export const getGeographyTool = createGetGeographyTool();
