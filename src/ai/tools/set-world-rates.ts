import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface WorldRates {
  populationRate: number | null;
  urbanization: number | null;
  urbanDensity: number | null;
}

export type WorldRatesPatch = Partial<{
  populationRate: number;
  urbanization: number;
  urbanDensity: number;
}>;

export interface WorldRatesRuntime {
  read(): WorldRates;
  write(patch: WorldRatesPatch): void;
}

interface FieldSpec {
  key: keyof WorldRatesPatch;
  inputKey: "population_rate" | "urbanization" | "urban_density";
  inputId: string;
  max: number;
}

const FIELDS: FieldSpec[] = [
  {
    key: "populationRate",
    inputKey: "population_rate",
    inputId: "populationRateInput",
    max: 1_000_000,
  },
  {
    key: "urbanization",
    inputKey: "urbanization",
    inputId: "urbanizationInput",
    max: 100,
  },
  {
    key: "urbanDensity",
    inputKey: "urban_density",
    inputId: "urbanDensityInput",
    max: 1_000_000,
  },
];

export type ValidationResult =
  | { ok: true; patch: WorldRatesPatch }
  | { ok: false; error: string };

export function validateRatesInput(
  input: Record<string, unknown>,
): ValidationResult {
  const patch: WorldRatesPatch = {};
  for (const spec of FIELDS) {
    const v = input[spec.inputKey];
    if (v === undefined || v === null) continue;
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v <= 0 ||
      v > spec.max
    ) {
      return {
        ok: false,
        error: `${spec.inputKey} must be a finite number > 0 and <= ${spec.max}.`,
      };
    }
    patch[spec.key] = v;
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error:
        "Provide at least one of: population_rate, urbanization, urban_density.",
    };
  }
  return { ok: true, patch };
}

function parseInput(el: HTMLInputElement | null): number | null {
  if (!el) return null;
  const n = Number.parseFloat(el.value);
  return Number.isFinite(n) ? n : null;
}

export const defaultWorldRatesRuntime: WorldRatesRuntime = {
  read(): WorldRates {
    if (typeof document === "undefined") {
      return { populationRate: null, urbanization: null, urbanDensity: null };
    }
    const ids = FIELDS.map((f) => f.inputId);
    const [pop, urb, den] = ids.map(
      (id) => document.getElementById(id) as HTMLInputElement | null,
    );
    return {
      populationRate: parseInput(pop),
      urbanization: parseInput(urb),
      urbanDensity: parseInput(den),
    };
  },
  write(patch: WorldRatesPatch): void {
    if (typeof document === "undefined") {
      throw new Error("document is not available; cannot apply rates.");
    }
    for (const spec of FIELDS) {
      const v = patch[spec.key];
      if (v === undefined) continue;
      const el = document.getElementById(
        spec.inputId,
      ) as HTMLInputElement | null;
      if (!el)
        throw new Error(
          `#${spec.inputId} is not available yet; wait for the map to finish loading.`,
        );
      el.value = String(v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  },
};

export function createSetWorldRatesTool(
  runtime: WorldRatesRuntime = defaultWorldRatesRuntime,
): Tool {
  return {
    name: "set_world_rates",
    description:
      "Adjust the world-wide population / urbanization sliders (Units Editor). Fields are optional; provide any subset. Values are floats > 0. population_rate = people per internal unit. urbanization = urban-to-rural ratio. urban_density = people per cell of urban area. Mirrors user input in the DOM and dispatches a change event so the map's population calculations pick up the new value.",
    input_schema: {
      type: "object",
      properties: {
        population_rate: {
          type: "number",
          description: "People per internal population unit (e.g. 1000). > 0.",
        },
        urbanization: {
          type: "number",
          description: "Urban-to-rural ratio (e.g. 1.0). > 0.",
        },
        urban_density: {
          type: "number",
          description: "People per cell of urban area (e.g. 10). > 0.",
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      const parsed = validateRatesInput(input);
      if (!parsed.ok) return errorResult(parsed.error);

      const previous = runtime.read();

      try {
        runtime.write(parsed.patch);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const current: WorldRates = {
        populationRate: parsed.patch.populationRate ?? previous.populationRate,
        urbanization: parsed.patch.urbanization ?? previous.urbanization,
        urbanDensity: parsed.patch.urbanDensity ?? previous.urbanDensity,
      };

      return okResult({ previous, current });
    },
  };
}

export const setWorldRatesTool = createSetWorldRatesTool();
