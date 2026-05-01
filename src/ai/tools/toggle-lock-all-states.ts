import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawState,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ToggleLockAllStatesResult {
  active_count: number;
  previously_all_locked: boolean;
  now_locked: number;
  now_unlocked: number;
  skipped_removed: number;
}

export interface ToggleLockAllStatesRuntime {
  getStates(): RawState[] | undefined;
  setLock(i: number, lock: boolean): void;
  addLines?: () => void;
  setLockAllIcon?: (className: string) => void;
}

interface StatePack {
  states?: RawState[];
}

export const defaultToggleLockAllStatesRuntime: ToggleLockAllStatesRuntime = {
  getStates(): RawState[] | undefined {
    const pack = getPack<StatePack>();
    const states = pack?.states;
    return Array.isArray(states) ? states : undefined;
  },
  setLock(i: number, lock: boolean): void {
    const pack = getPack<StatePack>();
    const states = pack?.states;
    if (!Array.isArray(states)) {
      throw new Error("pack.states is not available.");
    }
    const state = states[i];
    if (!state) throw new Error(`State ${i} not found.`);
    state.lock = lock;
  },
  addLines(): void {
    const fn = getGlobal<() => void>("statesEditorAddLines");
    if (typeof fn === "function") fn();
  },
  setLockAllIcon(className: string): void {
    if (typeof document === "undefined") return;
    const el = document.getElementById("statesLockAll");
    if (!el) return;
    el.className = className;
  },
};

export function createToggleLockAllStatesTool(
  runtime: ToggleLockAllStatesRuntime = defaultToggleLockAllStatesRuntime,
): Tool {
  return {
    name: "toggle_lock_all_states",
    description:
      'Toggle the `lock` flag on every active state to a SINGLE state — the bulk equivalent of the per-row lock buttons in the States Editor (`updateLockStatus` in `public/modules/dynamic/editors/states-editor.js`). Computes the active set as `pack.states.filter(s => s.i && !s.removed)` (skips state 0, the neutral / no-state placeholder, and removed states). If every active state is currently locked, unlocks them all; otherwise locks them all. NOT an invert — the WHOLE collection ends up in one state, not flipped per-state. When the active set is empty, `every` is vacuously true so the toggle direction is "unlock all" (no-op). State locks are honored by `regenerate_domain` (states) and `regenerate_all_state_names` — locked states are preserved when those tools roll the dice. Best-effort calls `statesEditorAddLines()` to refresh editor rows and updates the #statesLockAll icon className. Mutates pack.states in place. Takes no parameters. Distinct from set_entity_lock (single entity).',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      let states: RawState[] | undefined;
      try {
        states = runtime.getStates();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (!Array.isArray(states)) {
        return errorResult(
          "window.pack.states is not available; the map hasn't finished loading.",
        );
      }

      let activeCount = 0;
      let skippedRemoved = 0;
      const activeIndices: number[] = [];
      let allLocked = true;
      for (const state of states) {
        if (!state) continue;
        if (!state.i) continue;
        if (state.removed) {
          skippedRemoved++;
          continue;
        }
        activeIndices.push(state.i);
        activeCount++;
        if (!state.lock) allLocked = false;
      }

      const newLock = !allLocked;
      try {
        for (const i of activeIndices) {
          runtime.setLock(i, newLock);
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (typeof runtime.addLines === "function") {
        try {
          runtime.addLines();
        } catch {
          // Best-effort.
        }
      }

      const className = allLocked ? "icon-lock" : "icon-lock-open";
      if (typeof runtime.setLockAllIcon === "function") {
        try {
          runtime.setLockAllIcon(className);
        } catch {
          // Best-effort.
        }
      }

      const nowLocked = newLock ? activeCount : 0;
      const nowUnlocked = activeCount - nowLocked;

      return okResult({
        active_count: activeCount,
        previously_all_locked: allLocked,
        now_locked: nowLocked,
        now_unlocked: nowUnlocked,
        skipped_removed: skippedRemoved,
      });
    },
  };
}

export const toggleLockAllStatesTool = createToggleLockAllStatesTool();
