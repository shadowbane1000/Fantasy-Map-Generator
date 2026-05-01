import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegenerateDiplomacyResult {
  states_count: number;
  histogram: Record<string, number>;
}

export interface RegenerateDiplomacyRuntime {
  regenerate(): void;
  summarize(): RegenerateDiplomacyResult;
}

interface StatesModule {
  generateDiplomacy?: () => void;
}

export const defaultRegenerateDiplomacyRuntime: RegenerateDiplomacyRuntime = {
  regenerate() {
    const module = getGlobal<StatesModule>("States");
    if (!module || typeof module.generateDiplomacy !== "function") {
      throw new Error(
        "States.generateDiplomacy is not available; the map hasn't finished loading.",
      );
    }
    module.generateDiplomacy();
  },
  summarize() {
    const states = getPackCollection<RawState>("states");
    if (!Array.isArray(states)) {
      return { states_count: 0, histogram: {} };
    }
    const actives: RawState[] = [];
    for (const s of states) {
      if (s && s.i > 0 && !s.removed) actives.push(s);
    }
    const histogram: Record<string, number> = {};
    for (let i = 0; i < actives.length; i++) {
      const a = actives[i];
      if (!a) continue;
      for (let j = i + 1; j < actives.length; j++) {
        const b = actives[j];
        if (!b) continue;
        const rel = a.diplomacy?.[b.i];
        if (rel === undefined || rel === null) continue;
        histogram[rel] = (histogram[rel] ?? 0) + 1;
      }
    }
    return { states_count: actives.length, histogram };
  },
};

export function createRegenerateDiplomacyTool(
  runtime: RegenerateDiplomacyRuntime = defaultRegenerateDiplomacyRuntime,
): Tool {
  return {
    name: "regenerate_diplomacy",
    description:
      "Re-randomize all diplomatic relations between every pair of states — same side-effect as the Diplomacy editor's Regenerate button. Delegates to States.generateDiplomacy(), which rewrites state.diplomacy on every active state with fresh random relations (Friendly / Neutral / Suspicion / Enemy / Vassal / Suzerain / Ally / Rival / Unknown). Takes no arguments. Returns the post-regeneration active-state count plus a histogram of relation counts across all unordered pairs (use list_diplomacy for the full pair list).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      try {
        runtime.regenerate();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      const summary = runtime.summarize();
      return okResult({
        states_count: summary.states_count,
        histogram: summary.histogram,
      });
    },
  };
}

export const regenerateDiplomacyTool = createRegenerateDiplomacyTool();
