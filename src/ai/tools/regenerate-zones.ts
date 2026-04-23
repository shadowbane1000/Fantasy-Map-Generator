import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export const DEFAULT_ZONES_MULTIPLIER = 1;

interface ZonesModule {
  generate?: (multiplier?: number) => void;
}

export interface RegenerateZonesRuntime {
  regenerate(multiplier: number): void;
  countActive(): number;
}

export const defaultRegenerateZonesRuntime: RegenerateZonesRuntime = {
  regenerate(multiplier) {
    const module = getGlobal<ZonesModule>("Zones");
    if (!module || typeof module.generate !== "function") {
      throw new Error(
        "Zones.generate is not available yet; the map hasn't finished loading.",
      );
    }
    module.generate(multiplier);
    const draw = getGlobal<() => void>("drawZones");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: zones already generated.
      }
    }
  },
  countActive() {
    const zones = getPackCollection<RawZone>("zones");
    if (!Array.isArray(zones)) return 0;
    let n = 0;
    for (const z of zones) {
      if (z && z.i > 0 && !z.removed) n++;
    }
    return n;
  },
};

export function createRegenerateZonesTool(
  runtime: RegenerateZonesRuntime = defaultRegenerateZonesRuntime,
): Tool {
  return {
    name: "regenerate_zones",
    description: `Regenerate zones — same side-effect as the Tools panel's Regenerate Zones button. Delegates to Zones.generate(multiplier) and best-effort calls drawZones() to refresh the layer. Default multiplier is ${DEFAULT_ZONES_MULTIPLIER} (a neutral number of zones). Use > 1 for more zones, < 1 for fewer.`,
    input_schema: {
      type: "object",
      properties: {
        multiplier: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: `Optional multiplier applied to the zones count (range [0, 100]; default ${DEFAULT_ZONES_MULTIPLIER}).`,
        },
      },
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { multiplier?: unknown };

      let multiplier = DEFAULT_ZONES_MULTIPLIER;
      if (input.multiplier !== undefined && input.multiplier !== null) {
        if (
          typeof input.multiplier !== "number" ||
          !Number.isFinite(input.multiplier)
        ) {
          return errorResult("multiplier must be a finite number.");
        }
        if (input.multiplier < 0 || input.multiplier > 100) {
          return errorResult("multiplier must be in the range [0, 100].");
        }
        multiplier = input.multiplier;
      }

      try {
        runtime.regenerate(multiplier);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        multiplier,
        zones: runtime.countActive(),
      });
    },
  };
}

export const regenerateZonesTool = createRegenerateZonesTool();
