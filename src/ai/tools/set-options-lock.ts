import { createAliasResolver, errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

// Canonical IDs that have a `lock_<id>` icon and `data-stored="<id>"` input in
// src/index.html. These are the Options-dialog and World-configurator settings
// the user can pin to keep them stable across `regenerate_map`.
export const OPTIONS_LOCK_KEYS = [
  "points",
  "mapName",
  "year",
  "template",
  "templateSeed",
  "cultures",
  "culturesSet",
  "statesNumber",
  "provincesRatio",
  "sizeVariety",
  "growthRate",
  "manors",
  "religionsNumber",
  "stateLabelsMode",
  "emblemShape",
  "mapSize",
  "latitude",
  "longitude",
  "temperatureEquator",
  "temperatureNorthPole",
  "temperatureSouthPole",
  "prec",
  "distanceScale",
] as const;

export type OptionsLockKey = (typeof OPTIONS_LOCK_KEYS)[number];

// Friendly labels surfaced in tool output and help text.
export const OPTIONS_LOCK_DISPLAY_NAMES: Record<OptionsLockKey, string> = {
  points: "Points number",
  mapName: "Map name",
  year: "Year & era",
  template: "Heightmap template",
  templateSeed: "Heightmap template seed",
  cultures: "Cultures number",
  culturesSet: "Cultures set",
  statesNumber: "States number",
  provincesRatio: "Provinces ratio",
  sizeVariety: "Size variety",
  growthRate: "Growth rate",
  manors: "Burgs number",
  religionsNumber: "Religions number",
  stateLabelsMode: "State labels mode",
  emblemShape: "Emblem shape",
  mapSize: "Map size",
  latitude: "Latitude",
  longitude: "Longitude",
  temperatureEquator: "Temperature (equator)",
  temperatureNorthPole: "Temperature (north pole)",
  temperatureSouthPole: "Temperature (south pole)",
  prec: "Precipitation",
  distanceScale: "Distance scale",
};

// Locks that `randomizeOptions()` actually consults during `regenerate_map`.
// (See public/modules/ui/options.js and public/main.js.) Locks NOT in this set
// — e.g. mapName, year, templateSeed, emblemShape, stateLabelsMode — only
// affect localStorage persistence, not regeneration.
export const REGENERATION_GATING_LOCKS: ReadonlySet<OptionsLockKey> = new Set([
  "points",
  "template",
  "statesNumber",
  "provincesRatio",
  "manors",
  "religionsNumber",
  "sizeVariety",
  "growthRate",
  "cultures",
  "culturesSet",
  "mapSize",
  "latitude",
  "longitude",
  "temperatureEquator",
  "temperatureNorthPole",
  "temperatureSouthPole",
  "prec",
  "distanceScale",
]);

const SNAKE_CASE_ALIASES: Record<string, OptionsLockKey> = {
  points_number: "points",
  cells_density: "points",
  density: "points",
  map_name: "mapName",
  era: "year",
  heightmap: "template",
  heightmap_template: "template",
  template_seed: "templateSeed",
  cultures_number: "cultures",
  cultures_set: "culturesSet",
  culture_set: "culturesSet",
  states_number: "statesNumber",
  states: "statesNumber",
  provinces_ratio: "provincesRatio",
  size_variety: "sizeVariety",
  growth_rate: "growthRate",
  burgs: "manors",
  burgs_number: "manors",
  religions: "religionsNumber",
  religions_number: "religionsNumber",
  state_labels_mode: "stateLabelsMode",
  emblem_shape: "emblemShape",
  map_size: "mapSize",
  temperature_equator: "temperatureEquator",
  temperature_equatorial: "temperatureEquator",
  temperature_north_pole: "temperatureNorthPole",
  temperature_north: "temperatureNorthPole",
  temperature_south_pole: "temperatureSouthPole",
  temperature_south: "temperatureSouthPole",
  precipitation: "prec",
  distance_scale: "distanceScale",
};

const DISPLAY_ALIASES: Record<string, OptionsLockKey> = Object.fromEntries(
  OPTIONS_LOCK_KEYS.map((k) => [OPTIONS_LOCK_DISPLAY_NAMES[k], k]),
);

const resolveLockKey = createAliasResolver<OptionsLockKey>(OPTIONS_LOCK_KEYS, {
  ...SNAKE_CASE_ALIASES,
  ...DISPLAY_ALIASES,
});

export function resolveOptionsLockKey(value: unknown): OptionsLockKey | null {
  if (typeof value !== "string") return null;
  return resolveLockKey(value.trim().replace(/\s+/g, " "));
}

export interface OptionsLockRuntime {
  isLocked(id: OptionsLockKey): boolean;
  setLocked(id: OptionsLockKey, locked: boolean): void;
}

export const defaultOptionsLockRuntime: OptionsLockRuntime = {
  isLocked(id: OptionsLockKey): boolean {
    if (typeof document === "undefined") return false;
    const el = document.getElementById(`lock_${id}`);
    return el?.dataset?.locked === "1";
  },
  setLocked(id: OptionsLockKey, locked: boolean): void {
    if (typeof window === "undefined") {
      throw new Error("window is not available.");
    }
    const w = window as unknown as {
      lock?: (id: string) => void;
      unlock?: (id: string) => void;
    };
    const fn = locked ? w.lock : w.unlock;
    if (typeof fn !== "function") {
      throw new Error(
        `window.${locked ? "lock" : "unlock"} is not available yet; the map has not finished loading.`,
      );
    }
    fn(id);
    // Verify the icon flipped — defensively, the same way set_heightmap_template
    // verifies its select assignment. lock()/unlock() both bail silently if the
    // icon element is missing.
    if (typeof document !== "undefined") {
      const el = document.getElementById(`lock_${id}`);
      const observed = el?.dataset?.locked === "1";
      if (observed !== locked) {
        throw new Error(
          `Failed to ${locked ? "lock" : "unlock"} ${JSON.stringify(id)}; #lock_${id} did not update.`,
        );
      }
    }
  },
};

export function createSetOptionsLockTool(
  runtime: OptionsLockRuntime = defaultOptionsLockRuntime,
): Tool {
  return {
    name: "set_options_lock",
    description: `Lock or unlock an Options-dialog / World-configurator setting — the same side-effect as clicking one of the lock icons next to a setting in the UI. Locked settings are NOT re-randomized by \`regenerate_map\`'s \`randomizeOptions()\`, so locking is the only way to make a value (e.g. heightmap template, states number, climate) survive a full regeneration. Setting tools (\`set_heightmap_template\`, \`set_climate\`, \`set_generator_rates\`, …) do NOT auto-lock — manage locks explicitly with this tool. Idempotent. Lockable IDs: ${OPTIONS_LOCK_KEYS.join(", ")} (snake_case and display-name aliases like "states_number" / "States number" / "heightmap_template" / "Precipitation" are accepted, case-insensitive). Of these, the regeneration-gating locks are: ${[...REGENERATION_GATING_LOCKS].join(", ")} — locking the others (mapName, year, templateSeed, emblemShape, stateLabelsMode) only affects localStorage persistence. Returns \`{id, displayName, previouslyLocked, locked}\`.`,
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: `Setting to lock or unlock. One of: ${OPTIONS_LOCK_KEYS.join(", ")} (snake_case and display-name aliases accepted).`,
        },
        locked: {
          type: "boolean",
          description: "true to lock, false to unlock.",
        },
      },
      required: ["id", "locked"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { id?: unknown; locked?: unknown };

      if (typeof input.id !== "string" || !input.id.trim()) {
        return errorResult("id must be a non-empty string.", {
          supported: [...OPTIONS_LOCK_KEYS],
        });
      }
      if (typeof input.locked !== "boolean") {
        return errorResult(
          "locked must be a boolean (true to lock, false to unlock).",
        );
      }

      const resolved = resolveOptionsLockKey(input.id);
      if (!resolved) {
        return errorResult(
          `Unknown options lock id: ${JSON.stringify(input.id)}.`,
          {
            supported: [...OPTIONS_LOCK_KEYS],
            displayNames: OPTIONS_LOCK_KEYS.map(
              (k) => OPTIONS_LOCK_DISPLAY_NAMES[k],
            ),
          },
        );
      }

      const previouslyLocked = runtime.isLocked(resolved);

      if (previouslyLocked === input.locked) {
        return okResult({
          id: resolved,
          displayName: OPTIONS_LOCK_DISPLAY_NAMES[resolved],
          previouslyLocked,
          locked: input.locked,
          noop: true,
        });
      }

      try {
        runtime.setLocked(resolved, input.locked);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        id: resolved,
        displayName: OPTIONS_LOCK_DISPLAY_NAMES[resolved],
        previouslyLocked,
        locked: input.locked,
      });
    },
  };
}

export const setOptionsLockTool = createSetOptionsLockTool();
