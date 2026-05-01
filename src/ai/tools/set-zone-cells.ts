import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  parseEntityRef,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findZoneByRef } from "./set-zone-visibility";

const SAMPLE_LIMIT = 10;

export interface ZoneCellsRef {
  i: number;
  name: string;
  removed: boolean;
  previousCells: number[];
}

export type CellRangeResult =
  | { ok: true; max: number }
  | { ok: false; error: string };

export interface ZoneCellsRuntime {
  find(ref: number | string): ZoneCellsRef | null;
  getValidCellRange(): CellRangeResult;
  setCells(i: number, cells: number[]): void;
}

interface ZoneCellsPackLike {
  zones?: RawZone[];
  cells?: { i?: ArrayLike<unknown> };
}

function dedupePreserveOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export const defaultZoneCellsRuntime: ZoneCellsRuntime = {
  find(ref) {
    const zone = findZoneByRef(getPack<ZoneCellsPackLike>()?.zones, ref);
    if (!zone) return null;
    const previousCells = Array.isArray(zone.cells) ? zone.cells.slice() : [];
    return {
      i: zone.i,
      name: zone.name ?? "",
      removed: !!zone.removed,
      previousCells,
    };
  },
  getValidCellRange() {
    const pack = getPack<ZoneCellsPackLike>();
    if (!pack || !Array.isArray(pack.zones)) {
      return {
        ok: false,
        error:
          "window.pack.zones is not available; the map hasn't finished loading.",
      };
    }
    const cellIds = pack.cells?.i;
    if (!cellIds || typeof cellIds.length !== "number") {
      return {
        ok: false,
        error:
          "window.pack.cells.i is not available; the map hasn't finished loading.",
      };
    }
    return { ok: true, max: cellIds.length };
  },
  setCells(i: number, cells: number[]): void {
    const zone = findZoneByRef(getPack<ZoneCellsPackLike>()?.zones, i);
    if (!zone) throw new Error(`Zone ${i} not found.`);
    zone.cells = cells;
    const draw = getGlobal<() => void>("drawZones");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: data mutation already happened.
      }
    }
  },
};

export function createSetZoneCellsTool(
  runtime: ZoneCellsRuntime = defaultZoneCellsRuntime,
): Tool {
  return {
    name: "set_zone_cells",
    description:
      "Replace the cell-id list of a single zone — same side-effect as the Zones Editor's Manual mode (`zone.cells = [...]`). Resolves the zone by numeric `i` (non-contiguous ids) or case-insensitive name; rejects removed zones. Validates `cells` against pack.cells.i; duplicates are collapsed (first occurrence wins). The legacy code REASSIGNS zone.cells (does not push), so the previous list is fully replaced. Calls drawZones() to repaint the overlay. Pass cells: [] to clear membership.",
    input_schema: {
      type: "object",
      properties: {
        zone: {
          type: ["integer", "string"],
          description:
            "Numeric zone id (matches zone.i, not array index) or current case-insensitive name.",
        },
        cells: {
          type: "array",
          items: { type: "integer", minimum: 0 },
          description:
            "Cell ids that belong to the zone. Duplicates are collapsed; order preserved by first occurrence. Pass [] to clear membership.",
        },
      },
      required: ["zone", "cells"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        zone?: unknown;
        cells?: unknown;
      };

      const refResult = parseEntityRef(input.zone, "zone");
      if (!refResult.ok) return errorResult(refResult.error);

      if (input.cells === undefined || input.cells === null) {
        return errorResult("cells must be an array.");
      }
      if (!Array.isArray(input.cells)) {
        return errorResult("cells must be an array.");
      }
      const cellsRaw = input.cells as unknown[];
      for (let idx = 0; idx < cellsRaw.length; idx++) {
        const v = cellsRaw[idx];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
          return errorResult(`cells[${idx}] must be a non-negative integer.`);
        }
      }

      const current = runtime.find(refResult.ref);
      if (!current) {
        return errorResult(`Zone ${refResult.ref} not found.`);
      }
      if (current.removed) {
        return errorResult(`Cannot set cells on removed zone ${current.i}.`);
      }

      const range = runtime.getValidCellRange();
      if (!range.ok) {
        return errorResult(range.error);
      }
      const maxId = range.max;
      const cellsTyped = cellsRaw as number[];
      for (let idx = 0; idx < cellsTyped.length; idx++) {
        const v = cellsTyped[idx];
        if (v >= maxId) {
          return errorResult(
            `cells[${idx}] (${v}) is out of range (max ${maxId}).`,
          );
        }
      }

      const normalized = dedupePreserveOrder(cellsTyped);
      const previousCount = current.previousCells.length;
      const previousSample = current.previousCells.slice(0, SAMPLE_LIMIT);

      try {
        runtime.setCells(current.i, normalized);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const cellsSample = normalized.slice(0, SAMPLE_LIMIT);

      const body: Record<string, unknown> = {
        zone: { i: current.i, name: current.name },
        previous_count: previousCount,
        count: normalized.length,
        previous_cells_sample: previousSample,
        cells_sample: cellsSample,
      };
      if (previousCount > SAMPLE_LIMIT) {
        body.previous_cells_sample_truncated = true;
      }
      if (normalized.length > SAMPLE_LIMIT) {
        body.cells_sample_truncated = true;
      }
      return okResult(body);
    },
  };
}

export const setZoneCellsTool = createSetZoneCellsTool();
