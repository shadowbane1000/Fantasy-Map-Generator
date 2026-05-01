import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface ToggleLockAllBurgsResult {
  active_count: number;
  previously_all_locked: boolean;
  now_locked: number;
  now_unlocked: number;
  skipped_removed: number;
}

export interface ToggleLockAllBurgsRuntime {
  getBurgs(): RawBurg[] | undefined;
  setLock(i: number, lock: boolean): void;
  addLines?: () => void;
  setLockAllIcon?: (className: string) => void;
}

interface BurgPack {
  burgs?: RawBurg[];
}

export const defaultToggleLockAllBurgsRuntime: ToggleLockAllBurgsRuntime = {
  getBurgs(): RawBurg[] | undefined {
    const pack = getPack<BurgPack>();
    const burgs = pack?.burgs;
    return Array.isArray(burgs) ? burgs : undefined;
  },
  setLock(i: number, lock: boolean): void {
    const pack = getPack<BurgPack>();
    const burgs = pack?.burgs;
    if (!Array.isArray(burgs)) {
      throw new Error("pack.burgs is not available.");
    }
    const burg = burgs[i];
    if (!burg) throw new Error(`Burg ${i} not found.`);
    burg.lock = lock;
  },
  addLines(): void {
    const fn = getGlobal<() => void>("burgsOverviewAddLines");
    if (typeof fn === "function") fn();
  },
  setLockAllIcon(className: string): void {
    if (typeof document === "undefined") return;
    const el = document.getElementById("burgsLockAll");
    if (!el) return;
    el.className = className;
  },
};

export function createToggleLockAllBurgsTool(
  runtime: ToggleLockAllBurgsRuntime = defaultToggleLockAllBurgsRuntime,
): Tool {
  return {
    name: "toggle_lock_all_burgs",
    description:
      'Toggle the `lock` flag on every active burg to a SINGLE state — same side-effect as the "Lock all" icon button at the top of the Burgs Overview (`toggleLockAll` in `public/modules/ui/burgs-overview.js`). Computes the active set as `pack.burgs.filter(b => b.i && !b.removed)` (skips burg 0 placeholder and removed burgs). If every active burg is currently locked, unlocks them all; otherwise locks them all. NOT an invert — the WHOLE collection ends up in one state, not flipped per-burg. When the active set is empty, `every` is vacuously true so the toggle direction is "unlock all" (no-op). Best-effort calls `burgsOverviewAddLines()` to refresh overview rows and updates the #burgsLockAll icon className. Mutates pack.burgs in place. Takes no parameters. Distinct from set_entity_lock (single entity).',
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      let burgs: RawBurg[] | undefined;
      try {
        burgs = runtime.getBurgs();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      if (!Array.isArray(burgs)) {
        return errorResult(
          "window.pack.burgs is not available; the map hasn't finished loading.",
        );
      }

      let activeCount = 0;
      let skippedRemoved = 0;
      const activeIndices: number[] = [];
      let allLocked = true;
      for (const burg of burgs) {
        if (!burg) continue;
        if (!burg.i) continue;
        if (burg.removed) {
          skippedRemoved++;
          continue;
        }
        activeIndices.push(burg.i);
        activeCount++;
        if (!burg.lock) allLocked = false;
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

export const toggleLockAllBurgsTool = createToggleLockAllBurgsTool();
