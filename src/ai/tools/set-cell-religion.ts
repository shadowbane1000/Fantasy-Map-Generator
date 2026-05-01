import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Per-cell religion assignment override — mirrors the per-polygon
 * write inside `applyReligionsManualAssignent` in
 * `public/modules/dynamic/editors/religions-editor.js`
 * (around lines 728-742):
 *
 *   pack.cells.religion[i] = r;
 *
 * `pack.cells.religion` is a typed array (Uint8Array / Uint16Array
 * depending on map size). Direct scalar mutation; best-effort calls
 * `drawReligions()` to refresh the layer. Does NOT trigger
 * `recalculate_religions` or refresh the editor — the tool stays
 * atomic so callers can compose it freely. Peer to `set_cell_biome` /
 * `set_cell_culture` / `set_cell_height`.
 */

type CellReligionArrayLike = ArrayLike<number> & {
  [i: number]: number;
  length: number;
};

interface PackLike {
  cells?: {
    religion?: CellReligionArrayLike;
  };
  religions?: RawReligion[];
}

export interface CellReligionRuntime {
  getCellReligions(): CellReligionArrayLike | null;
  setCellReligion(cell: number, religion: number): void;
  getReligions(): RawReligion[] | null;
  drawReligions(): void;
}

export const defaultCellReligionRuntime: CellReligionRuntime = {
  getCellReligions(): CellReligionArrayLike | null {
    const arr = getPack<PackLike>()?.cells?.religion;
    if (!arr || typeof arr.length !== "number") return null;
    return arr;
  },
  setCellReligion(cell: number, religion: number): void {
    const arr = getPack<PackLike>()?.cells?.religion;
    if (!arr || typeof arr.length !== "number") {
      throw new Error(
        "window.pack.cells.religion is not available; the map hasn't finished loading.",
      );
    }
    arr[cell] = religion;
  },
  getReligions(): RawReligion[] | null {
    const religions = getPack<PackLike>()?.religions;
    if (!Array.isArray(religions)) return null;
    return religions;
  },
  drawReligions(): void {
    const fn = getGlobal<() => void>("drawReligions");
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

export function createSetCellReligionTool(
  runtime: CellReligionRuntime = defaultCellReligionRuntime,
): Tool {
  return {
    name: "set_cell_religion",
    description:
      'Override the religion assignment of a single packed-grid cell — writes `pack.cells.religion[cell] = religion` and best-effort calls `drawReligions()`. Same primitive side-effect as one stroke of the Religions Editor\'s Manual-mode brush (`applyReligionsManualAssignent` per-polygon write). Required `cell` (integer, 0 to `pack.cells.religion.length - 1` — packed-grid index in `pack.cells`). Required `religion` (integer religion id; index into `pack.religions`; `0` = the "No religion" placeholder is allowed). Atomic primitive: does NOT call `recalculate_religions` or refresh the religion centers — caller can chain those tools if expansion needs to propagate. Peer to `set_cell_biome`, `set_cell_culture`, `set_cell_height`. Returns `{cell, previous_religion, previous_religion_name, religion, religion_name}`. Requires an Anthropic API key (see "Getting an API key" below).',
    input_schema: {
      type: "object",
      properties: {
        cell: {
          type: "integer",
          minimum: 0,
          description: "Cell index in pack.cells (0-based).",
        },
        religion: {
          type: "integer",
          minimum: 0,
          description: "Religion id (0 = No religion).",
        },
      },
      required: ["cell", "religion"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        cell?: unknown;
        religion?: unknown;
      };

      const cell = validateNonNegativeInteger("cell", input.cell);
      if (typeof cell === "string") return errorResult(cell);

      const religion = validateNonNegativeInteger("religion", input.religion);
      if (typeof religion === "string") return errorResult(religion);

      const cellReligions = runtime.getCellReligions();
      if (!cellReligions) {
        return errorResult(
          "window.pack.cells.religion is not available; the map hasn't finished loading.",
        );
      }

      const religions = runtime.getReligions();
      if (!religions) {
        return errorResult(
          "window.pack.religions is not available; the map hasn't finished loading.",
        );
      }

      if (cell >= cellReligions.length) {
        return errorResult(
          `cell ${cell} is out of range (max ${cellReligions.length - 1}).`,
        );
      }

      if (religion >= religions.length) {
        return errorResult(
          `religion ${religion} is not a valid religion id (max ${religions.length - 1}).`,
        );
      }

      const religionEntry = religions[religion];
      if (!religionEntry || religionEntry.removed === true) {
        return errorResult(`Religion ${religion} has been removed.`);
      }

      const previous = cellReligions[cell];
      const previousReligionName = religions[previous]?.name ?? "";
      const religionName = religionEntry.name ?? "";

      try {
        runtime.setCellReligion(cell, religion);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      try {
        runtime.drawReligions();
      } catch {
        // Best-effort: data mutation already succeeded.
      }

      return okResult({
        cell,
        previous_religion: previous,
        previous_religion_name: previousReligionName,
        religion,
        religion_name: religionName,
      });
    },
  };
}

export const setCellReligionTool = createSetCellReligionTool();
