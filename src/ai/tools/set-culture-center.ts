import {
  errorResult,
  findEntityByRef,
  getPack,
  getPackCollection,
  okResult,
  parseEntityRef,
  type RawCulture,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface CultureCenterRef {
  i: number;
  name: string;
  previousCenter: number;
  locked: boolean;
}

export interface CultureCenterRuntime {
  find(ref: number | string): CultureCenterRef | null;
  getCellCount(): number;
  apply(i: number, cell: number): void;
}

interface PackWithCellsI {
  cells?: { i?: unknown[] };
}

export const defaultCultureCenterRuntime: CultureCenterRuntime = {
  find(ref) {
    const entry = findEntityByRef(
      getPackCollection<RawCulture>("cultures"),
      ref,
    );
    if (!entry) return null;
    return {
      i: entry.i,
      name: entry.name ?? "",
      previousCenter: typeof entry.center === "number" ? entry.center : 0,
      locked: !!entry.lock,
    };
  },
  getCellCount() {
    const cellsI = getPack<PackWithCellsI>()?.cells?.i;
    return Array.isArray(cellsI) ? cellsI.length : 0;
  },
  apply(i: number, cell: number): void {
    const cultures = getPackCollection<RawCulture>("cultures");
    const culture = cultures?.[i];
    if (!culture) throw new Error(`Culture ${i} not found.`);
    if (culture.removed) throw new Error(`Culture ${i} has been removed.`);
    culture.center = cell;
  },
};

export function createSetCultureCenterTool(
  runtime: CultureCenterRuntime = defaultCultureCenterRuntime,
): Tool {
  return {
    name: "set_culture_center",
    description:
      "Change a culture's center cell (its ancestral-home / origin cell) — same data mutation as dragging the culture-center handle in the Cultures Editor. Writes pack.cultures[i].center to the supplied cell id. The center seeds culture expansion (Cultures.expand) and flavours culture-specific naming. Matches culture by id (>0) or case-insensitive name. Rejects the Wildlands placeholder (culture 0), removed cultures, and locked cultures. Validates the cell id is within pack.cells.i bounds. Idempotent — supplying the current center returns a noop.",
    input_schema: {
      type: "object",
      properties: {
        culture: {
          type: ["integer", "string"],
          description:
            "Numeric culture id (> 0) or case-insensitive current name.",
        },
        cell: {
          type: "integer",
          description:
            "Target cell index (0 ≤ cell < pack.cells.i.length). Any valid cell id is accepted — the tool does not enforce the Cultures Editor's water-cell guard.",
        },
      },
      required: ["culture", "cell"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        culture?: unknown;
        cell?: unknown;
      };

      const refResult = parseEntityRef(input.culture, "culture");
      if (!refResult.ok) return errorResult(refResult.error);

      if (
        typeof input.cell !== "number" ||
        !Number.isInteger(input.cell) ||
        input.cell < 0
      ) {
        return errorResult("cell must be a non-negative integer.");
      }
      const cell = input.cell;

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(
          `No culture found matching ${JSON.stringify(refResult.ref)}.`,
        );
      }
      if (current.i <= 0) {
        return errorResult(
          "Cannot set center on culture 0 (the Wildlands placeholder).",
        );
      }
      if (current.locked) {
        return errorResult(
          `Culture ${current.i} (${JSON.stringify(current.name)}) is locked. Unlock it first via set_entity_lock.`,
        );
      }

      const cellCount = runtime.getCellCount();
      if (cellCount <= 0) {
        return errorResult(
          "pack.cells.i is not available yet; wait for the map to finish loading.",
        );
      }
      if (cell >= cellCount) {
        return errorResult(
          `cell ${cell} is out of range (0 <= cell < ${cellCount}).`,
        );
      }

      if (cell === current.previousCenter) {
        return okResult({
          i: current.i,
          name: current.name,
          previousCenter: current.previousCenter,
          center: cell,
          noop: true,
        });
      }

      try {
        runtime.apply(current.i, cell);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({
        i: current.i,
        name: current.name,
        previousCenter: current.previousCenter,
        center: cell,
        noop: false,
      });
    },
  };
}

export const setCultureCenterTool = createSetCultureCenterTool();
