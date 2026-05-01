import {
  errorResult,
  getGlobal,
  okResult,
  waitForWindowEvent,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export type RegenerateOptions = string | { seed: string };

export interface RegenerateRuntime {
  regenerate(options: RegenerateOptions): void;
  waitForRegeneration(timeoutMs: number): Promise<void>;
}

export const DEFAULT_REGENERATE_TIMEOUT_MS = 60_000;

export const defaultRegenerateRuntime: RegenerateRuntime = {
  regenerate(options: RegenerateOptions): void {
    const fn = getGlobal<(opts: RegenerateOptions) => void>("regenerateMap");
    if (typeof fn !== "function") {
      throw new Error(
        "regenerateMap is not available yet; the map has not finished initial loading.",
      );
    }
    fn(options);
  },
  waitForRegeneration(timeoutMs: number): Promise<void> {
    return waitForWindowEvent("map:generated", timeoutMs);
  },
};

export function createRegenerateMapTool(
  runtime: RegenerateRuntime = defaultRegenerateRuntime,
  timeoutMs: number = DEFAULT_REGENERATE_TIMEOUT_MS,
): Tool {
  return {
    name: "regenerate_map",
    description:
      "Generate a new fantasy map. Equivalent to clicking the 'New Map' button. Optionally pass a specific seed to reproduce a map. Waits for the new map to finish generating before returning. **Locks consulted:** the Options-dialog and World-configurator locks gate `randomizeOptions()`, which runs at the start of every regeneration. Unlocked settings are re-randomized; locked ones are preserved. The gating set is: template, points, statesNumber, provincesRatio, manors, religionsNumber, sizeVariety, growthRate, cultures, culturesSet, mapSize, latitude, longitude, temperatureEquator, temperatureNorthPole, temperatureSouthPole, prec, distanceScale. Use `list_options_locks` to inspect the current state and `set_options_lock` to adjust. Setter tools (`set_heightmap_template`, `set_climate`, `set_generator_rates`, …) do **not** auto-lock — if a setting was just changed and should survive regeneration, lock it explicitly first. Per-entity locks (state.lock, burg.lock, culture.lock, religion.lock, province.lock, marker.lock, route.lock) are NOT consulted by regenerate_map; they apply to `regenerate_domain` instead.",
    input_schema: {
      type: "object",
      properties: {
        seed: {
          type: ["string", "number"],
          description:
            "Optional numeric-style seed. Pass the same seed to reproduce the same map. If omitted, a new random seed is used.",
        },
      },
    },
    async execute(rawInput: unknown): Promise<ToolResult> {
      const input = (rawInput ?? {}) as { seed?: unknown };

      let seed: string | undefined;
      if (input.seed !== undefined && input.seed !== null) {
        if (typeof input.seed === "string") {
          const trimmed = input.seed.trim();
          if (!trimmed) {
            return errorResult("seed must be a non-empty string if provided.");
          }
          seed = trimmed;
        } else if (
          typeof input.seed === "number" &&
          Number.isFinite(input.seed)
        ) {
          seed = String(input.seed);
        } else {
          return errorResult("seed must be a string or a finite number.");
        }
      }

      const options: RegenerateOptions = seed ? { seed } : "ai-chat";

      try {
        runtime.regenerate(options);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        await runtime.waitForRegeneration(timeoutMs);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err), {
          triggered: true,
        });
      }

      return okResult({ seed: seed ?? null });
    },
  };
}

export const regenerateMapTool = createRegenerateMapTool();
