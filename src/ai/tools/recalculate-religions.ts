import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RecalculateReligionsRuntime {
  /** Returns a copy of pack.cells.religion as a plain number[], or null
   * when pack/cells/religion is unavailable. */
  snapshot(): number[] | null;
  /** Calls Religions.recalculate(); throws Error when the global is
   * missing. */
  recalculate(): void;
  /** Best-effort drawReligions(); should not throw, but the caller wraps
   * defensively too. */
  drawReligions(): void;
  /** Best-effort drawReligionCenters(); should not throw, but the caller
   * wraps defensively too. */
  drawReligionCenters(): void;
}

interface ReligionsModule {
  recalculate?: () => void;
}

interface PackShape {
  cells?: { religion?: ArrayLike<number> };
}

export const defaultRecalculateReligionsRuntime: RecalculateReligionsRuntime = {
  snapshot() {
    const pack = getGlobal<PackShape>("pack");
    const religion = pack?.cells?.religion;
    if (!religion || typeof religion.length !== "number") return null;
    return Array.from(religion);
  },
  recalculate() {
    const module = getGlobal<ReligionsModule>("Religions");
    if (!module || typeof module.recalculate !== "function") {
      throw new Error(
        "Religions.recalculate is not available; the map hasn't finished loading.",
      );
    }
    module.recalculate();
  },
  drawReligions() {
    const fn = getGlobal<() => void>("drawReligions");
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch {
      // Best-effort: data mutation already landed.
    }
  },
  drawReligionCenters() {
    const fn = getGlobal<() => void>("drawReligionCenters");
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch {
      // Best-effort: data mutation already landed.
    }
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

export function createRecalculateReligionsTool(
  runtime: RecalculateReligionsRuntime = defaultRecalculateReligionsRuntime,
): Tool {
  return {
    name: "recalculate_religions",
    description:
      "Re-run the religion expansion algorithm so pack.cells.religion matches the current religion centers / expansion / type values — same side-effect as the Religions Editor's Recalculate button. Calls Religions.recalculate() (which rewrites cells.religion via the expansion algorithm and repairs displaced centers), then best-effort drawReligions() and drawReligionCenters() to refresh the layer. Use this after editing religion centers / expansion / expansionism via the set_religion_* tools so the cell assignments propagate. Takes no arguments. Returns the before/after religion-id distributions plus a cells_changed count (Hamming distance between the two cell-religion snapshots).",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const previous = runtime.snapshot();
      if (previous === null) {
        return errorResult(
          "window.pack is not available; the map hasn't finished loading.",
        );
      }

      try {
        runtime.recalculate();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const current = runtime.snapshot();
      if (current === null) {
        return errorResult(
          "window.pack is not available; the map hasn't finished loading.",
        );
      }

      const cells_changed = diffCount(previous, current);
      const previous_distribution = histogram(previous);
      const distribution = histogram(current);

      try {
        runtime.drawReligions();
      } catch {
        // Best-effort: data mutation already landed.
      }
      try {
        runtime.drawReligionCenters();
      } catch {
        // Best-effort: data mutation already landed.
      }

      return okResult({
        cells_changed,
        previous_distribution,
        distribution,
      });
    },
  };
}

export const recalculateReligionsTool = createRecalculateReligionsTool();
