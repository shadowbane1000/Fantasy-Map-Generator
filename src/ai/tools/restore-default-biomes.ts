import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Per-entry shape we read out of the restored data. Only `name` is
 * consumed for the response payload — the rest of the data
 * (color / habitability / biomesMatrix / icons / iconsDensity / cost)
 * is passed through opaquely via the global reassignment.
 */
export interface BiomesDataLike {
  name?: unknown;
}

export interface RestoreDefaultBiomesResult {
  biomes_count: number;
  cells_changed: number;
  drew: boolean;
  recalculated_population: boolean;
}

/**
 * Runtime-injection seam. The default implementation reads / mutates
 * `window.Biomes`, `window.biomesData`, `window.pack.cells.biome`,
 * `window.drawBiomes`, and `window.recalculatePopulation` directly.
 * Tests inject a stub to exercise the call-order + error paths in
 * isolation.
 *
 * Important: `setBiomesData` REASSIGNS the global binding (it does
 * `globalThis.biomesData = data`). Mirroring the legacy editor's
 * `biomesData = Biomes.getDefault()` semantics — NOT an in-place
 * mutation of the existing object.
 */
export interface RestoreDefaultBiomesRuntime {
  /**
   * Return the bundled default biomes object. Throws if the `Biomes`
   * global is missing or `getDefault` is not callable.
   */
  getDefault(): unknown;
  /**
   * Reassign `window.biomesData = data`. Load-bearing: this is a
   * REPLACEMENT of the binding, not an in-place mutation.
   */
  setBiomesData(data: unknown): void;
  /**
   * Walk every cell and write `pack.cells.biome[i]` from the
   * now-current `biomesData.biomesMatrix`. Throws if the `Biomes`
   * global is missing or `define` is not callable.
   */
  define(): void;
  /**
   * Return `pack.cells.biome` (the typed array). Called twice: once
   * for the pre-define snapshot, once for the post-define diff.
   * Throws if `pack.cells.biome` is unavailable.
   */
  getCellBiomes(): ArrayLike<number>;
  /**
   * Best-effort: invoke `globalThis.drawBiomes()`. Returns `true` if
   * called and didn't throw, `false` otherwise (missing or threw).
   */
  drawBiomes(): boolean;
  /**
   * Best-effort: invoke `globalThis.recalculatePopulation()`. Returns
   * `true` if called and didn't throw, `false` otherwise.
   */
  recalculatePopulation(): boolean;
}

interface BiomesModuleLike {
  getDefault?: () => unknown;
  define?: () => void;
}

interface PackLike {
  cells?: { biome?: ArrayLike<number> };
}

export const defaultRestoreDefaultBiomesRuntime: RestoreDefaultBiomesRuntime = {
  getDefault(): unknown {
    const mod = getGlobal<BiomesModuleLike>("Biomes");
    if (!mod || typeof mod.getDefault !== "function") {
      throw new Error(
        "Biomes.getDefault is not available; the map hasn't finished loading.",
      );
    }
    return mod.getDefault();
  },
  setBiomesData(data: unknown): void {
    (globalThis as Record<string, unknown>).biomesData = data;
  },
  define(): void {
    const mod = getGlobal<BiomesModuleLike>("Biomes");
    if (!mod || typeof mod.define !== "function") {
      throw new Error(
        "Biomes.define is not available; the map hasn't finished loading.",
      );
    }
    mod.define();
  },
  getCellBiomes(): ArrayLike<number> {
    const pack = getPack<PackLike>();
    const biome = pack?.cells?.biome;
    if (!biome || typeof biome.length !== "number") {
      throw new Error(
        "window.pack.cells.biome is not available; the map hasn't finished loading.",
      );
    }
    return biome;
  },
  drawBiomes(): boolean {
    const fn = getGlobal<() => void>("drawBiomes");
    if (typeof fn !== "function") return false;
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  },
  recalculatePopulation(): boolean {
    const fn = getGlobal<() => void>("recalculatePopulation");
    if (typeof fn !== "function") return false;
    try {
      fn();
      return true;
    } catch {
      return false;
    }
  },
};

function countBiomes(data: unknown): number {
  if (data && typeof data === "object") {
    const name = (data as { name?: unknown }).name;
    if (Array.isArray(name)) return name.length;
  }
  return 0;
}

export function createRestoreDefaultBiomesTool(
  runtime: RestoreDefaultBiomesRuntime = defaultRestoreDefaultBiomesRuntime,
): Tool {
  return {
    name: "restore_default_biomes",
    description:
      "Wipe any user-edited biomes and reload the bundled default set, then re-assign every cell's biome from the defaults' temperature/precipitation matrix — same side-effect as the Restore button in the Biomes editor (biomes-editor.js → restoreInitialBiomes). Reassigns window.biomesData = Biomes.getDefault() (the default 13-entry pack: Marine, Hot desert, Cold desert, Savanna, Grassland, …, Wetland), then calls Biomes.define() to walk every cell and write pack.cells.biome[i] from the new matrix, then best-effort calls drawBiomes() and recalculatePopulation(). Takes no arguments. Returns the new biome count, the number of cells whose biome assignment actually changed, and whether the layer redraw and population recalc each succeeded.",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      // Snapshot cell biomes BEFORE define runs. If pack.cells.biome
      // is missing we bail early and leave biomesData untouched.
      let snapshot: number[];
      try {
        const before = runtime.getCellBiomes();
        snapshot = Array.from(before, (v) => v);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      let defaults: unknown;
      try {
        defaults = runtime.getDefault();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      // Load-bearing global REASSIGNMENT — must precede define()
      // because Biomes.define reads biomesData.biomesMatrix via the
      // global.
      runtime.setBiomesData(defaults);

      try {
        runtime.define();
      } catch (err) {
        // Mirror legacy: biomesData has already been swapped; do not
        // roll back.
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      // Compute cells_changed by reading the now-mutated cell biomes
      // and diffing against the pre-define snapshot.
      const after = runtime.getCellBiomes();
      const len = Math.min(snapshot.length, after.length);
      let cells_changed = 0;
      for (let i = 0; i < len; i++) {
        if (snapshot[i] !== after[i]) cells_changed++;
      }

      const drew = runtime.drawBiomes();
      const recalculated_population = runtime.recalculatePopulation();

      return okResult({
        biomes_count: countBiomes(defaults),
        cells_changed,
        drew,
        recalculated_population,
      });
    },
  };
}

export const restoreDefaultBiomesTool = createRestoreDefaultBiomesTool();
