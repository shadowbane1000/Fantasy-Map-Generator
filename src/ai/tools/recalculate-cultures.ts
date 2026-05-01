import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type Pack,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RecalculateCulturesRuntime {
  getPack(): Pack | undefined;
  expandCultures(): void;
  drawCultures(): void;
}

interface CulturesModule {
  expand?: () => void;
}

interface CellCultureArray {
  length: number;
  [index: number]: number;
}

export const defaultRecalculateCulturesRuntime: RecalculateCulturesRuntime = {
  getPack() {
    return getPack<Pack>();
  },
  expandCultures() {
    const module = getGlobal<CulturesModule>("Cultures");
    if (!module || typeof module.expand !== "function") {
      throw new Error(
        "Cultures.expand is not available; the map hasn't finished loading.",
      );
    }
    module.expand();
  },
  drawCultures() {
    const fn = getGlobal<() => void>("drawCultures");
    if (typeof fn !== "function") {
      throw new Error("window.drawCultures is not available.");
    }
    fn();
  },
};

function buildHistogram(cells: CellCultureArray): Record<string, number> {
  const histo: Record<string, number> = {};
  for (let i = 0; i < cells.length; i++) {
    const key = String(cells[i]);
    histo[key] = (histo[key] ?? 0) + 1;
  }
  return histo;
}

export function createRecalculateCulturesTool(
  runtime: RecalculateCulturesRuntime = defaultRecalculateCulturesRuntime,
): Tool {
  return {
    name: "recalculate_cultures",
    description:
      "Re-run the culture-expansion algorithm so cell→culture assignments and burg cultures match the current culture centers / expansionism / type values — same side-effect as the Cultures Editor's Recalculate button (force=true). Calls Cultures.expand(), drawCultures(), then re-syncs each burg.culture from pack.cells.culture[burg.cell]. Use after editing culture centers, expansionism, or type to propagate the change to cells and burgs (set_culture_* mutators only touch metadata; this tool propagates them). Takes no arguments. Returns cells_changed, burgs_changed, plus pre/post histograms { cultureId: count } over pack.cells.culture so the LLM can describe what shifted without a follow-up tool call.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      const pack = runtime.getPack();
      const cellsCulture = pack?.cells?.culture as CellCultureArray | undefined;
      const burgs = pack?.burgs;
      if (
        !pack ||
        !cellsCulture ||
        typeof cellsCulture.length !== "number" ||
        !Array.isArray(burgs)
      ) {
        return errorResult(
          "window.pack is not available; the map hasn't finished loading.",
        );
      }

      // Snapshot pre-expand state BEFORE running the recalc — load-bearing
      // for cells_changed / burgs_changed and the previous_distribution
      // result field. If we snapshotted after expand(), every "previous"
      // would equal the new value and changes would always read 0.
      const previousCells: number[] = new Array(cellsCulture.length);
      for (let i = 0; i < cellsCulture.length; i++) {
        previousCells[i] = cellsCulture[i] as number;
      }
      const previousDistribution = buildHistogram(cellsCulture);
      const previousBurgCulture = new Map<number, number | undefined>();
      for (const burg of burgs) {
        if (!burg) continue;
        previousBurgCulture.set(burg.i, burg.culture);
      }

      try {
        runtime.expandCultures();
        runtime.drawCultures();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        for (const burg of burgs) {
          if (!burg) continue;
          if (typeof burg.cell !== "number") continue;
          burg.culture = cellsCulture[burg.cell] as number;
        }
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let cellsChanged = 0;
      for (let i = 0; i < cellsCulture.length; i++) {
        if (previousCells[i] !== (cellsCulture[i] as number)) cellsChanged++;
      }

      let burgsChanged = 0;
      for (const burg of burgs) {
        if (!burg) continue;
        if (typeof burg.cell !== "number") continue;
        if (previousBurgCulture.get(burg.i) !== burg.culture) burgsChanged++;
      }

      const distribution = buildHistogram(cellsCulture);

      return okResult({
        cells_changed: cellsChanged,
        burgs_changed: burgsChanged,
        previous_distribution: previousDistribution,
        distribution,
      });
    },
  };
}

export const recalculateCulturesTool = createRecalculateCulturesTool();
