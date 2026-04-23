import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";
import { isValidCssColor } from "./set-state-color";

export const MIN_HABITABILITY = 0;
export const MAX_HABITABILITY = 9999;
export const MIN_COST = 0;
export const MAX_COST = 100000;
export const MIN_ICONS_DENSITY = 0;
export const MAX_ICONS_DENSITY = 9999;
export const MAX_BIOMES = 255;

export interface AddBiomeInput {
  name: string;
  color: string;
  habitability: number;
  cost: number;
  iconsDensity: number;
  icons: string[];
}

export interface NewBiome {
  i: number;
  name: string;
  color: string;
  habitability: number;
  cost: number;
  iconsDensity: number;
  icons: string[];
}

export interface AddBiomeRuntime {
  add(input: AddBiomeInput): NewBiome;
}

interface BiomesDataLike {
  i?: number[];
  name?: string[];
  color?: string[];
  habitability?: number[];
  iconsDensity?: number[];
  icons?: string[][];
  cost?: number[];
  rural?: number[];
  urban?: number[];
  cells?: number[];
  area?: number[];
}

function isFilledArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export const defaultAddBiomeRuntime: AddBiomeRuntime = {
  add(input: AddBiomeInput): NewBiome {
    const biomesData = getGlobal<BiomesDataLike>("biomesData");
    if (!biomesData) {
      throw new Error("biomesData is not available.");
    }
    const requiredArrays: [string, unknown][] = [
      ["i", biomesData.i],
      ["name", biomesData.name],
      ["color", biomesData.color],
      ["habitability", biomesData.habitability],
      ["iconsDensity", biomesData.iconsDensity],
      ["icons", biomesData.icons],
      ["cost", biomesData.cost],
    ];
    for (const [key, arr] of requiredArrays) {
      if (!isFilledArray(arr)) {
        throw new Error(`biomesData.${key} is not an array.`);
      }
    }

    const i = biomesData.i!.length;
    if (i > MAX_BIOMES - 1) {
      throw new Error(
        `Maximum number of biomes reached (${MAX_BIOMES}); data cleansing is required.`,
      );
    }

    biomesData.i!.push(i);
    biomesData.name!.push(input.name);
    biomesData.color!.push(input.color);
    biomesData.habitability!.push(input.habitability);
    biomesData.iconsDensity!.push(input.iconsDensity);
    biomesData.icons!.push(input.icons);
    biomesData.cost!.push(input.cost);

    if (Array.isArray(biomesData.rural)) biomesData.rural.push(0);
    if (Array.isArray(biomesData.urban)) biomesData.urban.push(0);
    if (Array.isArray(biomesData.cells)) biomesData.cells.push(0);
    if (Array.isArray(biomesData.area)) biomesData.area.push(0);

    return {
      i,
      name: input.name,
      color: input.color,
      habitability: input.habitability,
      cost: input.cost,
      iconsDensity: input.iconsDensity,
      icons: input.icons,
    };
  },
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isIntegerInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

export function createAddBiomeTool(
  runtime: AddBiomeRuntime = defaultAddBiomeRuntime,
): Tool {
  return {
    name: "add_biome",
    description: `Create a new biome entry by extending the parallel arrays on biomesData — same side-effect as the "Add biome" button in the Biomes Editor (addCustomBiome). Appends to biomesData.i / name / color / habitability / iconsDensity / icons / cost (and zero-extends rural / urban / cells / area when those stat arrays exist). The new biome's id is biomesData.i.length. Required: name (non-empty, not the "removed" sentinel), color (CSS color), habitability (integer [${MIN_HABITABILITY}, ${MAX_HABITABILITY}]), cost (integer [${MIN_COST}, ${MAX_COST}]). Optional: iconsDensity (integer [${MIN_ICONS_DENSITY}, ${MAX_ICONS_DENSITY}], default 0) and icons (string[] of icon names, default []). Hard cap at ${MAX_BIOMES} biomes because cells store biome as Uint8Array. Data-only: no DOM refresh — the new biome becomes visible on the next map regeneration or when the Biomes Editor is opened. Follow up with set_biome_color / set_biome_cost / set_biome_habitability / rename_biome to tweak; use remove_biome to delete (custom biomes only, id >= 13).`,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Biome display name. Non-empty after trim. Cannot be the literal string 'removed' (that's the deletion sentinel used by remove_biome).",
        },
        color: {
          type: "string",
          description:
            "CSS color value (hex, rgb()/rgba(), hsl()/hsla(), or a named color).",
        },
        habitability: {
          type: "integer",
          minimum: MIN_HABITABILITY,
          maximum: MAX_HABITABILITY,
          description: `Habitability density multiplier applied to each biome's cells (0 = uninhabitable, matching Marine / Glacier defaults). Integer in [${MIN_HABITABILITY}, ${MAX_HABITABILITY}].`,
        },
        cost: {
          type: "integer",
          minimum: MIN_COST,
          maximum: MAX_COST,
          description: `Movement cost consulted by states / cultures / religions expansion generators (higher = harder to expand through). Integer in [${MIN_COST}, ${MAX_COST}].`,
        },
        iconsDensity: {
          type: "integer",
          minimum: MIN_ICONS_DENSITY,
          maximum: MAX_ICONS_DENSITY,
          description: `Relief-icon density multiplier (higher = more icons drawn). Integer in [${MIN_ICONS_DENSITY}, ${MAX_ICONS_DENSITY}]. Defaults to 0.`,
        },
        icons: {
          type: "array",
          items: { type: "string" },
          description:
            "List of icon names drawn on cells of this biome (parsed flat form — duplicates are allowed and control relative weighting, e.g. ['conifer','conifer','swamp']). Defaults to []. Each entry must be a non-empty string.",
        },
      },
      required: ["name", "color", "habitability", "cost"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        name?: unknown;
        color?: unknown;
        habitability?: unknown;
        cost?: unknown;
        iconsDensity?: unknown;
        icons?: unknown;
      };

      if (!isNonEmptyString(input.name)) {
        return errorResult("name must be a non-empty string.");
      }
      const name = input.name.trim();
      if (name === "removed") {
        return errorResult(
          "'removed' is a reserved sentinel for biome deletion; pick another name.",
        );
      }

      if (!isValidCssColor(input.color)) {
        return errorResult(
          "color must be a valid CSS color (#hex, rgb(), rgba(), hsl(), hsla(), or a named color).",
        );
      }
      const color = input.color.trim();

      if (
        !isIntegerInRange(
          input.habitability,
          MIN_HABITABILITY,
          MAX_HABITABILITY,
        )
      ) {
        return errorResult(
          `habitability must be an integer in [${MIN_HABITABILITY}, ${MAX_HABITABILITY}].`,
        );
      }

      if (!isIntegerInRange(input.cost, MIN_COST, MAX_COST)) {
        return errorResult(
          `cost must be an integer in [${MIN_COST}, ${MAX_COST}].`,
        );
      }

      let iconsDensity = 0;
      if (input.iconsDensity !== undefined && input.iconsDensity !== null) {
        if (
          !isIntegerInRange(
            input.iconsDensity,
            MIN_ICONS_DENSITY,
            MAX_ICONS_DENSITY,
          )
        ) {
          return errorResult(
            `iconsDensity must be an integer in [${MIN_ICONS_DENSITY}, ${MAX_ICONS_DENSITY}].`,
          );
        }
        iconsDensity = input.iconsDensity;
      }

      let icons: string[] = [];
      if (input.icons !== undefined && input.icons !== null) {
        if (!Array.isArray(input.icons)) {
          return errorResult("icons, if provided, must be an array.");
        }
        const cleaned: string[] = [];
        for (const v of input.icons) {
          if (typeof v !== "string" || !v.trim()) {
            return errorResult("icons must contain only non-empty strings.");
          }
          cleaned.push(v.trim());
        }
        icons = cleaned;
      }

      const addInput: AddBiomeInput = {
        name,
        color,
        habitability: input.habitability,
        cost: input.cost,
        iconsDensity,
        icons,
      };

      try {
        const created = runtime.add(addInput);
        return okResult({
          i: created.i,
          name: created.name,
          color: created.color,
          habitability: created.habitability,
          cost: created.cost,
          iconsDensity: created.iconsDensity,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addBiomeTool = createAddBiomeTool();
