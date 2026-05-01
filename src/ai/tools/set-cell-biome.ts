import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Per-cell biome assignment override — mirrors the per-polygon write
 * inside `applyBiomesChange` in `public/modules/ui/biomes-editor.js`
 * (around lines 438-451):
 *
 *   pack.cells.biome[i] = b;
 *
 * `pack.cells.biome` is a typed array (Uint8Array in current builds).
 * Direct scalar mutation; best-effort calls `drawBiomes()` to refresh
 * the layer. Does NOT recalculate population — the legacy editor calls
 * `recalculatePopulation()` only when habitability differs; we keep
 * this tool atomic and leave that to a follow-up tool. Peer to
 * `set_cell_height`.
 */

type CellBiomeArrayLike = ArrayLike<number> & {
  [i: number]: number;
  length: number;
};

interface BiomesDataLike {
  name?: string[];
}

interface PackLike {
  cells?: {
    biome?: CellBiomeArrayLike;
  };
}

export interface CellBiomeRuntime {
  getCellBiomes(): CellBiomeArrayLike | null;
  setCellBiome(cell: number, biome: number): void;
  getBiomeNames(): string[] | null;
  drawBiomes(): void;
}

export const defaultCellBiomeRuntime: CellBiomeRuntime = {
  getCellBiomes(): CellBiomeArrayLike | null {
    const arr = getPack<PackLike>()?.cells?.biome;
    if (!arr || typeof arr.length !== "number") return null;
    return arr;
  },
  setCellBiome(cell: number, biome: number): void {
    const arr = getPack<PackLike>()?.cells?.biome;
    if (!arr || typeof arr.length !== "number") {
      throw new Error(
        "window.pack.cells.biome is not available; the map hasn't finished loading.",
      );
    }
    arr[cell] = biome;
  },
  getBiomeNames(): string[] | null {
    const names = getGlobal<BiomesDataLike>("biomesData")?.name;
    if (!Array.isArray(names)) return null;
    return names;
  },
  drawBiomes(): void {
    const fn = getGlobal<() => void>("drawBiomes");
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch {
      // Best-effort: the data mutation already happened.
    }
  },
};

function validateNonNegativeInteger(
  name: string,
  raw: unknown,
): number | string {
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    !Number.isInteger(raw) ||
    raw < 0
  ) {
    return `${name} must be a non-negative integer.`;
  }
  return raw;
}

export function createSetCellBiomeTool(
  runtime: CellBiomeRuntime = defaultCellBiomeRuntime,
): Tool {
  return {
    name: "set_cell_biome",
    description:
      'Override the biome assignment of a single packed-grid cell — writes `pack.cells.biome[cell] = biome` and best-effort calls `drawBiomes()`. Same primitive side-effect as one stroke of the Biomes Editor\'s Customization-mode brush (`applyBiomesChange` per-polygon write). Required `cell` (integer, 0 to `pack.cells.biome.length - 1` — the packed-grid index, NOT the pre-Voronoi `grid.cells` index used by `set_cell_height`). Required `biome` (integer biome id; index into `biomesData`; 0 = Marine is allowed). Atomic primitive: does NOT recompute population (the editor calls `recalculatePopulation()` only when habitability differs — caller can invoke a follow-up recalc tool if needed). Peer to `set_cell_height`. Returns `{cell, previous_biome, previous_biome_name, biome, biome_name}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        cell: {
          type: "integer",
          minimum: 0,
          description: "Cell index in pack.cells (0-based).",
        },
        biome: {
          type: "integer",
          minimum: 0,
          description: "Biome id (index into biomesData).",
        },
      },
      required: ["cell", "biome"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        cell?: unknown;
        biome?: unknown;
      };

      const cell = validateNonNegativeInteger("cell", input.cell);
      if (typeof cell === "string") return errorResult(cell);

      const biome = validateNonNegativeInteger("biome", input.biome);
      if (typeof biome === "string") return errorResult(biome);

      const cellBiomes = runtime.getCellBiomes();
      if (!cellBiomes) {
        return errorResult(
          "window.pack.cells.biome is not available; the map hasn't finished loading.",
        );
      }

      const biomeNames = runtime.getBiomeNames();
      if (!biomeNames) {
        return errorResult(
          "window.biomesData.name is not available; the map hasn't finished loading.",
        );
      }

      if (cell >= cellBiomes.length) {
        return errorResult(
          `cell ${cell} is out of range (max ${cellBiomes.length - 1}).`,
        );
      }

      if (biome >= biomeNames.length) {
        return errorResult(
          `biome ${biome} is not a valid biome id (max ${biomeNames.length - 1}).`,
        );
      }

      const previous = cellBiomes[cell];
      const previousBiomeName = biomeNames[previous] ?? "";
      const biomeName = biomeNames[biome] ?? "";

      try {
        runtime.setCellBiome(cell, biome);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.drawBiomes();
      } catch {
        // Best-effort: data mutation already succeeded.
      }

      return okResult({
        cell,
        previous_biome: previous,
        previous_biome_name: previousBiomeName,
        biome,
        biome_name: biomeName,
      });
    },
  };
}

export const setCellBiomeTool = createSetCellBiomeTool();
