import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Per-cell culture assignment override — mirrors the per-polygon write
 * inside `applyCultureManualAssignent` in
 * `public/modules/dynamic/editors/cultures-editor.js` (around lines
 * 759-773):
 *
 *   pack.cells.culture[i] = c;
 *
 * `pack.cells.culture` is a typed array (Uint16Array in current
 * builds). Direct scalar mutation; best-effort calls `drawCultures()`
 * to refresh the layer. Does NOT mutate the co-located burg's culture
 * (the legacy editor does — we keep the primitive narrow; caller can
 * invoke `set_burg_culture` explicitly). Does NOT recalculate
 * population or expand cultures — keeps this tool atomic. Caller can
 * follow up with `recalculate_cultures` if propagation is desired.
 * Peer to `set_cell_biome` and `set_cell_height`.
 */

type CellCultureArrayLike = ArrayLike<number> & {
  [i: number]: number;
  length: number;
};

interface CultureLike {
  i?: number;
  name?: string;
  removed?: boolean;
}

interface PackLike {
  cells?: {
    culture?: CellCultureArrayLike;
  };
  cultures?: (CultureLike | null | undefined)[];
}

export interface CellCultureRuntime {
  getCellCultures(): CellCultureArrayLike | null;
  setCellCulture(cell: number, culture: number): void;
  getCultures(): (CultureLike | null | undefined)[] | null;
  drawCultures(): void;
}

export const defaultCellCultureRuntime: CellCultureRuntime = {
  getCellCultures(): CellCultureArrayLike | null {
    const arr = getPack<PackLike>()?.cells?.culture;
    if (!arr || typeof arr.length !== "number") return null;
    return arr;
  },
  setCellCulture(cell: number, culture: number): void {
    const arr = getPack<PackLike>()?.cells?.culture;
    if (!arr || typeof arr.length !== "number") {
      throw new Error(
        "window.pack.cells.culture is not available; the map hasn't finished loading.",
      );
    }
    arr[cell] = culture;
  },
  getCultures(): (CultureLike | null | undefined)[] | null {
    const cultures = getPack<PackLike>()?.cultures;
    if (!Array.isArray(cultures)) return null;
    return cultures;
  },
  drawCultures(): void {
    const fn = getGlobal<() => void>("drawCultures");
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

export function createSetCellCultureTool(
  runtime: CellCultureRuntime = defaultCellCultureRuntime,
): Tool {
  return {
    name: "set_cell_culture",
    description:
      "Override the culture assignment of a single packed-grid cell — writes `pack.cells.culture[cell] = culture` and best-effort calls `drawCultures()`. Same primitive side-effect as one stroke of the Cultures Editor's Manual-mode brush (`applyCultureManualAssignent` per-polygon write). Required `cell` (integer, 0 to `pack.cells.culture.length - 1` — the packed-grid index, NOT the pre-Voronoi `grid.cells` index used by `set_cell_height`). Required `culture` (integer culture id; index into `pack.cultures`; 0 = Wildlands is allowed). Removed cultures cannot be assigned to. Atomic primitive: does NOT mutate the co-located burg's culture (use `set_burg_culture` for that), does NOT recompute population, does NOT call `Cultures.expand()` — caller can invoke `recalculate_cultures` to propagate. Peer to `set_cell_biome` and `set_cell_height`. Returns `{cell, previous_culture, previous_culture_name, culture, culture_name}`. Requires an Anthropic API key (see \"Getting an API key\" below).",
    input_schema: {
      type: "object",
      properties: {
        cell: {
          type: "integer",
          minimum: 0,
          description: "Cell index in pack.cells (0-based).",
        },
        culture: {
          type: "integer",
          minimum: 0,
          description: "Culture id (0 = Wildlands).",
        },
      },
      required: ["cell", "culture"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        cell?: unknown;
        culture?: unknown;
      };

      const cell = validateNonNegativeInteger("cell", input.cell);
      if (typeof cell === "string") return errorResult(cell);

      const culture = validateNonNegativeInteger("culture", input.culture);
      if (typeof culture === "string") return errorResult(culture);

      const cellCultures = runtime.getCellCultures();
      if (!cellCultures) {
        return errorResult(
          "window.pack.cells.culture is not available; the map hasn't finished loading.",
        );
      }

      const cultures = runtime.getCultures();
      if (!cultures) {
        return errorResult(
          "window.pack.cultures is not available; the map hasn't finished loading.",
        );
      }

      if (cell >= cellCultures.length) {
        return errorResult(
          `cell ${cell} is out of range (max ${cellCultures.length - 1}).`,
        );
      }

      if (culture >= cultures.length) {
        return errorResult(
          `culture ${culture} is not a valid culture id (max ${cultures.length - 1}).`,
        );
      }

      const entry = cultures[culture];
      if (entry == null || entry.removed === true) {
        return errorResult(`Culture ${culture} has been removed.`);
      }

      const previous = cellCultures[cell];
      const previousCultureName = cultures[previous]?.name ?? "";
      const cultureName = entry.name ?? "";

      try {
        runtime.setCellCulture(cell, culture);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.drawCultures();
      } catch {
        // Best-effort: data mutation already succeeded.
      }

      return okResult({
        cell,
        previous_culture: previous,
        previous_culture_name: previousCultureName,
        culture,
        culture_name: cultureName,
      });
    },
  };
}

export const setCellCultureTool = createSetCellCultureTool();
