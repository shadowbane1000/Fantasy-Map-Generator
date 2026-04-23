import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

interface HeightmapBoolField {
  kind: "bool";
  inputId: string;
  storedKey: string;
}

interface HeightmapIntField {
  kind: "int";
  inputId: string;
  outputId: string;
  storedKey: string;
  min: number;
  max: number;
}

type HeightmapField = HeightmapBoolField | HeightmapIntField;

const FIELDS: Record<string, HeightmapField> = {
  allow_erosion: {
    kind: "bool",
    inputId: "allowErosion",
    storedKey: "allowErosion",
  },
  resolve_depressions_steps: {
    kind: "int",
    inputId: "resolveDepressionsStepsInput",
    outputId: "resolveDepressionsStepsOutput",
    storedKey: "resolveDepressionsSteps",
    min: 0,
    max: 1000,
  },
  lake_elevation_limit: {
    kind: "int",
    inputId: "lakeElevationLimitInput",
    outputId: "lakeElevationLimitOutput",
    storedKey: "lakeElevationLimit",
    min: 0,
    max: 80,
  },
};

export const HEIGHTMAP_OPTION_KEYS: readonly string[] = Object.freeze(
  Object.keys(FIELDS),
);

export interface HeightmapOptionsRuntime {
  apply(key: string, value: number | boolean): void;
}

export const defaultHeightmapOptionsRuntime: HeightmapOptionsRuntime = {
  apply(key, value) {
    const field = FIELDS[key];
    if (!field) return;
    if (typeof document !== "undefined") {
      if (field.kind === "bool") {
        const input = document.getElementById(
          field.inputId,
        ) as HTMLInputElement | null;
        if (input) input.checked = Boolean(value);
      } else {
        const asStr = String(value);
        const input = document.getElementById(
          field.inputId,
        ) as HTMLInputElement | null;
        if (input) input.value = asStr;
        const output = document.getElementById(
          field.outputId,
        ) as HTMLInputElement | null;
        if (output) output.value = asStr;
      }
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(field.storedKey, String(value));
    }
  },
};

function validate(key: string, raw: unknown): string | number | boolean {
  const field = FIELDS[key];
  if (!field) return `Unknown field: ${key}.`;
  if (field.kind === "bool") {
    if (typeof raw !== "boolean") return `${key} must be a boolean.`;
    return raw;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return `${key} must be a finite number.`;
  }
  if (!Number.isInteger(raw)) {
    return `${key} must be an integer.`;
  }
  if (raw < field.min || raw > field.max) {
    return `${key} must be in the range [${field.min}, ${field.max}].`;
  }
  return raw;
}

export function createSetHeightmapOptionsTool(
  runtime: HeightmapOptionsRuntime = defaultHeightmapOptionsRuntime,
): Tool {
  return {
    name: "set_heightmap_options",
    description:
      "Tune three heightmap / terrain-generation options in the Options dialog (passive — applied on next regenerate_map). Fields: `allow_erosion` (boolean — whether water erosion is applied during height generation), `resolve_depressions_steps` (int 0–1000, default 250 — max iterations for the depression-filling algorithm; raise if you see rivers ending nowhere), `lake_elevation_limit` (int 0–80, default 20 — depression depth threshold for lake formation; raise to reduce the number of generated lakes). Writes the paired Input/Output DOM elements (or checkbox) and localStorage. At least one field required.",
    input_schema: {
      type: "object",
      properties: {
        allow_erosion: {
          type: "boolean",
          description:
            "Whether water erosion is applied during height generation.",
        },
        resolve_depressions_steps: {
          type: "integer",
          minimum: 0,
          maximum: 1000,
          description: "Max iterations for the depression-filling algorithm.",
        },
        lake_elevation_limit: {
          type: "integer",
          minimum: 0,
          maximum: 80,
          description: "Depression depth threshold for lake formation.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      const provided: Array<[string, number | boolean]> = [];
      for (const key of HEIGHTMAP_OPTION_KEYS) {
        if (input[key] === undefined || input[key] === null) continue;
        const validated = validate(key, input[key]);
        if (typeof validated === "string") {
          return errorResult(validated);
        }
        provided.push([key, validated]);
      }
      if (provided.length === 0) {
        return errorResult(
          `at least one of ${HEIGHTMAP_OPTION_KEYS.join(", ")} is required.`,
        );
      }

      const applied: Array<{ name: string; value: number | boolean }> = [];
      try {
        for (const [key, value] of provided) {
          runtime.apply(key, value);
          applied.push({ name: key, value });
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ applied });
    },
  };
}

export const setHeightmapOptionsTool = createSetHeightmapOptionsTool();
