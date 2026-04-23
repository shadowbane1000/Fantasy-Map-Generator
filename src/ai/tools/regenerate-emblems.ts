import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawBurg,
  type RawProvince,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegenerateEmblemsCounts {
  states: number;
  burgs: number;
  provinces: number;
}

export interface RegenerateEmblemsRuntime {
  regenerate(): void;
  counts(): RegenerateEmblemsCounts;
}

function countActive<T extends { i: number; removed?: boolean }>(
  items: T[] | undefined,
): number {
  if (!Array.isArray(items)) return 0;
  let n = 0;
  for (const e of items) {
    if (e && e.i > 0 && !e.removed) n++;
  }
  return n;
}

export const defaultRegenerateEmblemsRuntime: RegenerateEmblemsRuntime = {
  regenerate() {
    const fn = getGlobal<() => void>("regenerateEmblems");
    if (typeof fn !== "function") {
      throw new Error(
        "regenerateEmblems is not available yet; the map has not finished loading.",
      );
    }
    fn();
  },
  counts() {
    return {
      states: countActive(getPackCollection<RawState>("states")),
      burgs: countActive(getPackCollection<RawBurg>("burgs")),
      provinces: countActive(getPackCollection<RawProvince>("provinces")),
    };
  },
};

export function createRegenerateEmblemsTool(
  runtime: RegenerateEmblemsRuntime = defaultRegenerateEmblemsRuntime,
): Tool {
  return {
    name: "regenerate_emblems",
    description:
      "Regenerate every coat of arms on the map — same side-effect as the Tools panel's Regenerate Emblems button. Wipes all existing state / province / burg COA DOM elements, generates fresh coa objects for every active entity (with culture-appropriate heraldic kinship), and redraws the Emblems layer. Takes no arguments. Returns counts of how many active states / burgs / provinces were regenerated.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const counts = runtime.counts();
      try {
        runtime.regenerate();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      return okResult({
        states: counts.states,
        burgs: counts.burgs,
        provinces: counts.provinces,
      });
    },
  };
}

export const regenerateEmblemsTool = createRegenerateEmblemsTool();
