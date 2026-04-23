import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const WIND_BAND_COUNT = 6;
export const DEFAULT_WINDS: readonly number[] = Object.freeze([
  225, 45, 225, 315, 135, 315,
]);
export const WIND_STORED_KEY = "winds";
export const WIND_ARROW_SELECTOR = (band: number) =>
  `#globeWindArrows path[data-tier="${band}"]`;

/**
 * Friendly aliases for the six 30°-wide latitude bands (N → S).
 * Tier index is the numeric position in `options.winds`.
 */
export const WIND_BAND_ALIASES: Readonly<Record<string, number>> =
  Object.freeze({
    polar_north: 0,
    "polar-north": 0,
    polarnorth: 0,
    temperate_north: 1,
    "temperate-north": 1,
    temperatenorth: 1,
    tropical_north: 2,
    "tropical-north": 2,
    tropicalnorth: 2,
    tropical_south: 3,
    "tropical-south": 3,
    tropicalsouth: 3,
    temperate_south: 4,
    "temperate-south": 4,
    temperatesouth: 4,
    polar_south: 5,
    "polar-south": 5,
    polarsouth: 5,
  });

export function resolveBand(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input < 0 || input >= WIND_BAND_COUNT) {
      return null;
    }
    return input;
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return null;
    const asNum = Number(trimmed);
    if (Number.isInteger(asNum) && asNum >= 0 && asNum < WIND_BAND_COUNT) {
      return asNum;
    }
    const key = trimmed.toLowerCase();
    const alias = WIND_BAND_ALIASES[key];
    if (typeof alias === "number") return alias;
  }
  return null;
}

export function normaliseAngle(n: number): number {
  return ((n % 360) + 360) % 360;
}

function parseWindsFromStorage(
  raw: string | null | undefined,
): number[] | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const parts = raw.split(",").map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== WIND_BAND_COUNT) return null;
  for (const p of parts) {
    if (!Number.isFinite(p)) return null;
  }
  return parts;
}

interface WindOptions {
  winds?: number[];
}

export interface SetWindRuntime {
  read(band: number): number | null;
  apply(band: number, direction: number): void;
}

function parseTransformCenter(
  transform: string | null | undefined,
): { cx: number; cy: number } | null {
  if (!transform) return null;
  const match = transform.match(
    /rotate\(\s*-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/,
  );
  if (!match) return null;
  const cx = Number.parseFloat(match[1] ?? "");
  const cy = Number.parseFloat(match[2] ?? "");
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { cx, cy };
}

export const defaultSetWindRuntime: SetWindRuntime = {
  read(band: number): number | null {
    const options = getGlobal<WindOptions>("options");
    const fromOptions = options?.winds?.[band];
    if (typeof fromOptions === "number" && Number.isFinite(fromOptions)) {
      return fromOptions;
    }
    if (typeof localStorage !== "undefined") {
      const parsed = parseWindsFromStorage(
        localStorage.getItem(WIND_STORED_KEY),
      );
      if (parsed) {
        const v = parsed[band];
        if (typeof v === "number" && Number.isFinite(v)) return v;
      }
    }
    return null;
  },
  apply(band: number, direction: number): void {
    const options = getGlobal<WindOptions>("options");
    if (!options) {
      throw new Error("window.options is not available yet.");
    }
    if (
      !Array.isArray(options.winds) ||
      options.winds.length !== WIND_BAND_COUNT
    ) {
      options.winds = DEFAULT_WINDS.slice();
    }
    options.winds[band] = direction;

    if (typeof document !== "undefined") {
      try {
        const path = document.querySelector(WIND_ARROW_SELECTOR(band));
        if (path) {
          const center = parseTransformCenter(path.getAttribute("transform"));
          if (center) {
            path.setAttribute(
              "transform",
              `rotate(${direction} ${center.cx} ${center.cy})`,
            );
          }
        }
      } catch {
        // Best-effort DOM update — fall through so localStorage still lands.
      }
    }

    if (typeof localStorage === "undefined") {
      throw new Error("localStorage is not available.");
    }
    localStorage.setItem(WIND_STORED_KEY, options.winds.join(","));
  },
};

interface BandEntry {
  band: number;
  direction: number;
}

function validateDirection(raw: unknown): number | string {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return "direction must be a finite number (degrees).";
  }
  return normaliseAngle(raw);
}

function collectEntries(input: Record<string, unknown>): BandEntry[] | string {
  const forms: string[] = [];
  if (input.band !== undefined || input.direction !== undefined) {
    forms.push("band/direction");
  }
  if (input.bands !== undefined) forms.push("bands");
  if (input.directions !== undefined) forms.push("directions");
  if (input.reset !== undefined) forms.push("reset");

  if (forms.length === 0) {
    return "Provide one of: {band, direction}, {bands}, {directions}, or {reset: true}.";
  }
  if (forms.length > 1) {
    return `Provide exactly one input form — got: ${forms.join(", ")}.`;
  }

  if (input.reset !== undefined) {
    if (input.reset !== true) return "reset must be the boolean true.";
    return DEFAULT_WINDS.map((direction, band) => ({ band, direction }));
  }

  if (input.directions !== undefined) {
    if (!Array.isArray(input.directions)) {
      return "directions must be an array.";
    }
    if (input.directions.length !== WIND_BAND_COUNT) {
      return `directions must have exactly ${WIND_BAND_COUNT} entries (one per tier).`;
    }
    const entries: BandEntry[] = [];
    for (let i = 0; i < WIND_BAND_COUNT; i++) {
      const validated = validateDirection(input.directions[i]);
      if (typeof validated === "string") {
        return `directions[${i}]: ${validated}`;
      }
      entries.push({ band: i, direction: validated });
    }
    return entries;
  }

  if (input.bands !== undefined) {
    if (!Array.isArray(input.bands)) return "bands must be an array.";
    if (input.bands.length === 0) return "bands must not be empty.";
    const entries: BandEntry[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < input.bands.length; i++) {
      const item = input.bands[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return `bands[${i}] must be an object {band, direction}.`;
      }
      const obj = item as Record<string, unknown>;
      const band = resolveBand(obj.band);
      if (band === null) {
        return `bands[${i}].band must be an integer 0..${WIND_BAND_COUNT - 1} or an alias.`;
      }
      if (seen.has(band)) {
        return `bands[${i}].band ${band} is duplicated.`;
      }
      seen.add(band);
      const direction = validateDirection(obj.direction);
      if (typeof direction === "string") {
        return `bands[${i}].${direction}`;
      }
      entries.push({ band, direction });
    }
    return entries;
  }

  // {band, direction}
  const band = resolveBand(input.band);
  if (band === null) {
    return `band must be an integer 0..${WIND_BAND_COUNT - 1} or an alias.`;
  }
  const direction = validateDirection(input.direction);
  if (typeof direction === "string") return direction;
  return [{ band, direction }];
}

export function createSetWindTool(
  runtime: SetWindRuntime = defaultSetWindRuntime,
): Tool {
  return {
    name: "set_wind",
    description:
      `Set the prevailing wind direction for one or more latitude bands — the ` +
      `World Configurator's globe arrows. \`options.winds\` is a 6-element array ` +
      `of angles in degrees (0-360); tiers are 30°-wide bands N → S: ` +
      `0=polar_north (60-90°N), 1=temperate_north (30-60°N), 2=tropical_north (0-30°N), ` +
      `3=tropical_south (0-30°S), 4=temperate_south (30-60°S), 5=polar_south (60-90°S). ` +
      `Defaults: [225, 45, 225, 315, 135, 315]. Angles are normalised to [0, 360). ` +
      `Passive: affects precipitation on the next regenerate_map. Provide exactly one ` +
      `of: {band, direction} to set a single tier; {bands: [{band, direction}, ...]} ` +
      `for multiple; {directions: [d0..d5]} to replace all six; {reset: true} to ` +
      `restore defaults. \`band\` accepts an integer 0-5 or a label ` +
      `(polar_north / temperate_north / tropical_north / tropical_south / ` +
      `temperate_south / polar_south). Triple-write: mutates \`options.winds[tier]\`, ` +
      `rewrites the matching \`#globeWindArrows path[data-tier]\` transform, and ` +
      `persists \`localStorage["winds"]\` — the same side-effects as the UI's own ` +
      `handleWindChange + restoreDefaultWinds. Returns ` +
      `{changes: [{band, previousDirection, direction}, ...]}.`,
    input_schema: {
      type: "object",
      properties: {
        band: {
          description:
            "Latitude-band index 0-5 or alias (polar_north..polar_south).",
        },
        direction: {
          type: "number",
          description:
            "Wind angle in degrees; normalised to [0, 360). Used with `band`.",
        },
        bands: {
          type: "array",
          description:
            "Batch of {band, direction} pairs. Use INSTEAD of band/direction.",
          items: {
            type: "object",
            properties: {
              band: {},
              direction: { type: "number" },
            },
            required: ["band", "direction"],
          },
        },
        directions: {
          type: "array",
          description:
            "Exactly 6 wind angles, tiers 0..5 N→S. Replaces all bands.",
          items: { type: "number" },
          minItems: WIND_BAND_COUNT,
          maxItems: WIND_BAND_COUNT,
        },
        reset: {
          type: "boolean",
          description: `Set true to restore the defaults (${DEFAULT_WINDS.join(", ")}).`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      const entries = collectEntries(input);
      if (typeof entries === "string") return errorResult(entries);

      const changes: Array<{
        band: number;
        previousDirection: number | null;
        direction: number;
      }> = [];

      try {
        for (const { band, direction } of entries) {
          const previousDirection = runtime.read(band);
          runtime.apply(band, direction);
          changes.push({ band, previousDirection, direction });
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err), {
          changes,
        });
      }

      return okResult({ changes });
    },
  };
}

export const setWindTool = createSetWindTool();
