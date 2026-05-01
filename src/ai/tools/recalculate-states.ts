import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RecalculateStatesRuntime {
  /** Returns a copy of pack.cells.state as a plain number[], or null
   * when pack/cells/state is unavailable. */
  snapshotState(): number[] | null;
  /** Returns a copy of pack.cells.province as a plain number[], or
   * null when pack/cells/province is unavailable. */
  snapshotProvince(): number[] | null;
  /** Calls window.recalculateStates(true); throws Error when the
   * global is missing. */
  recalculate(): void;
}

interface PackShape {
  cells?: {
    state?: ArrayLike<number>;
    province?: ArrayLike<number>;
  };
}

function snapshotField(field: "state" | "province"): number[] | null {
  const pack = getGlobal<PackShape>("pack");
  const arr = pack?.cells?.[field];
  if (!arr || typeof arr.length !== "number") return null;
  return Array.from(arr);
}

export const defaultRecalculateStatesRuntime: RecalculateStatesRuntime = {
  snapshotState() {
    return snapshotField("state");
  },
  snapshotProvince() {
    return snapshotField("province");
  },
  recalculate() {
    const fn = getGlobal<(must: boolean) => void>("recalculateStates");
    if (typeof fn !== "function") {
      throw new Error(
        "window.recalculateStates is not available; the map hasn't finished loading.",
      );
    }
    fn(true);
  },
};

function histogram(arr: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of arr) {
    const k = String(v);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function diffCount(prev: number[], curr: number[]): number {
  const len = Math.max(prev.length, curr.length);
  let n = 0;
  for (let i = 0; i < len; i++) {
    const a = prev[i] ?? -1;
    const b = curr[i] ?? -1;
    if (a !== b) n++;
  }
  return n;
}

export function createRecalculateStatesTool(
  runtime: RecalculateStatesRuntime = defaultRecalculateStatesRuntime,
): Tool {
  return {
    name: "recalculate_states",
    description:
      "Re-run the state-expansion and province-generation algorithms so cell→state and cell→province assignments match the current state expansionism / capital / culture / type values — same side-effect as the States Editor's Recalculate button. Calls window.recalculateStates(true), which runs States.expandStates(), Provinces.generate(), Provinces.getPoles(), States.getPoles(), then layer-toggle-aware redraws of the states / borders / provinces / state-labels layers. Use this after editing state expansionism / capital / culture / type via the set_entity_expansionism / set_state_* tools so the cell assignments and borders propagate without resorting to randomize_states_expansion (which would destroy expansionism data). Takes no arguments. Returns cells_state_changed, cells_province_changed, plus before/after histograms over pack.cells.state and pack.cells.province.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const previousState = runtime.snapshotState();
      const previousProvince = runtime.snapshotProvince();
      if (previousState === null || previousProvince === null) {
        return errorResult(
          "window.pack is not available; the map hasn't finished loading.",
        );
      }

      try {
        runtime.recalculate();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const currentState = runtime.snapshotState();
      const currentProvince = runtime.snapshotProvince();
      if (currentState === null || currentProvince === null) {
        return errorResult(
          "window.pack is not available; the map hasn't finished loading.",
        );
      }

      const cells_state_changed = diffCount(previousState, currentState);
      const cells_province_changed = diffCount(
        previousProvince,
        currentProvince,
      );

      return okResult({
        cells_state_changed,
        cells_province_changed,
        previous_state_distribution: histogram(previousState),
        state_distribution: histogram(currentState),
        previous_province_distribution: histogram(previousProvince),
        province_distribution: histogram(currentProvince),
      });
    },
  };
}

export const recalculateStatesTool = createRecalculateStatesTool();
