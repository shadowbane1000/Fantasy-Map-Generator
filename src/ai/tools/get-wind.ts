import { getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { WIND_BAND_COUNT, WIND_STORED_KEY } from "./set-wind";

/**
 * Canonical band names in tier order (N → S). The index of each name
 * matches the index in `options.winds` and in `set_wind`'s
 * `directions` array.
 */
export const WIND_BAND_NAMES = [
  "polar_north",
  "temperate_north",
  "tropical_north",
  "tropical_south",
  "temperate_south",
  "polar_south",
] as const;

export type WindBandName = (typeof WIND_BAND_NAMES)[number];

export type WindSnapshot = Record<WindBandName, number | null>;

export interface WindReadRuntime {
  read(): WindSnapshot;
}

interface WindOptions {
  winds?: unknown;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parseWindsTuple(raw: string | null | undefined): number[] | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const parts = raw.split(",").map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== WIND_BAND_COUNT) return null;
  for (const p of parts) {
    if (!Number.isFinite(p)) return null;
  }
  return parts;
}

function readBand(band: number): number | null {
  const options = getGlobal<WindOptions>("options");
  if (
    options &&
    Array.isArray(options.winds) &&
    options.winds.length === WIND_BAND_COUNT
  ) {
    const fromOptions = toFiniteNumber(options.winds[band]);
    if (fromOptions !== null) return fromOptions;
  }
  if (typeof localStorage !== "undefined") {
    const tuple = parseWindsTuple(localStorage.getItem(WIND_STORED_KEY));
    if (tuple) {
      const v = tuple[band];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return null;
}

export const defaultWindReadRuntime: WindReadRuntime = {
  read(): WindSnapshot {
    const snapshot = {} as WindSnapshot;
    for (let band = 0; band < WIND_BAND_COUNT; band++) {
      const name = WIND_BAND_NAMES[band] as WindBandName;
      snapshot[name] = readBand(band);
    }
    return snapshot;
  },
};

export function createGetWindTool(
  runtime: WindReadRuntime = defaultWindReadRuntime,
): Tool {
  return {
    name: "get_wind",
    description:
      "Read the current prevailing wind directions (degrees) for the six 30°-wide latitude bands the World Configurator's globe arrows control — inverse of `set_wind`. Reports `polar_north` (60-90°N), `temperate_north` (30-60°N), `tropical_north` (0-30°N), `tropical_south` (0-30°S), `temperate_south` (30-60°S), `polar_south` (60-90°S). Per band, reads `window.options.winds[tier]` when finite, then falls back to `localStorage.getItem(\"winds\")` (the comma-joined 6-tuple `set_wind` persists). Returns a number when the band resolves, or `null` if no source had a usable value. Also returns a parallel `directions: [d0..d5]` array (tier order N→S) to round-trip with `set_wind`'s `{directions}` form. Read-only; never mutates options, the DOM, or localStorage. Takes no parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(): ToolResult {
      const snapshot = runtime.read();
      const directions = WIND_BAND_NAMES.map((name) => snapshot[name]);
      return okResult({ ...snapshot, directions });
    },
  };
}

export const getWindTool = createGetWindTool();
