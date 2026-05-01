import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RandomizeStatesExpansionChange {
  i: number;
  name: string;
  previous: number;
  expansionism: number;
}

export interface RandomizeStatesExpansionRuntime {
  randomExpansionism(): number;
  getStates(): RawState[] | undefined;
  recalculate(): void;
}

function defaultRandom(): number {
  const rn = getGlobal<(n: number, p: number) => number>("rn");
  if (typeof rn === "function") {
    return rn(Math.random() * 4 + 1, 1);
  }
  return Math.round((Math.random() * 4 + 1) * 10) / 10;
}

export const defaultRandomizeStatesExpansionRuntime: RandomizeStatesExpansionRuntime =
  {
    randomExpansionism() {
      return defaultRandom();
    },
    getStates() {
      return getPackCollection<RawState>("states");
    },
    recalculate() {
      const fn =
        getGlobal<(must: boolean, randomize: boolean) => void>(
          "recalculateStates",
        );
      if (typeof fn !== "function") {
        throw new Error("window.recalculateStates is not available.");
      }
      fn(true, true);
    },
  };

export function createRandomizeStatesExpansionTool(
  runtime: RandomizeStatesExpansionRuntime = defaultRandomizeStatesExpansionRuntime,
): Tool {
  return {
    name: "randomize_states_expansion",
    description:
      "Randomize every active state's expansionism and re-run the state / province expansion — same side-effect as the States editor's Randomize button. For each active state (i > 0, not removed), assigns a fresh random value in (1, 5] rounded to 1 decimal, then calls recalculateStates(true, true) once after all mutations to update cell.state assignments and redraw state / border / province / label layers. Takes no arguments. Returns a per-state list of {i, name, previous, expansionism}, sorted by id.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const states = runtime.getStates();
      if (!Array.isArray(states)) {
        return errorResult(
          "window.pack.states is not available; the map hasn't finished loading.",
        );
      }

      const changes: RandomizeStatesExpansionChange[] = [];
      for (const s of states) {
        if (!s || s.i <= 0 || s.removed) continue;
        const previous =
          typeof s.expansionism === "number" ? s.expansionism : 1;
        const next = runtime.randomExpansionism();
        s.expansionism = next;
        changes.push({
          i: s.i,
          name: s.name ?? "",
          previous,
          expansionism: next,
        });
      }

      changes.sort((a, b) => a.i - b.i);

      if (changes.length === 0) {
        return okResult({ changes: [] });
      }

      try {
        runtime.recalculate();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ changes });
    },
  };
}

export const randomizeStatesExpansionTool =
  createRandomizeStatesExpansionTool();
