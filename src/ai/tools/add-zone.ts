import {
  errorResult,
  getGlobal,
  getPack,
  okResult,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface AddZoneInput {
  name: string;
  type: string;
  color?: string;
  cells?: number[];
}

export interface NewZone {
  i: number;
  name: string;
  type: string;
  color: string;
  cells: number[];
}

export type ValidateCellsResult = { ok: true } | { ok: false; error: string };

export interface AddZoneRuntime {
  validateCells(cells: number[]): ValidateCellsResult;
  add(input: AddZoneInput): NewZone;
}

interface AddZonePackLike {
  zones?: RawZone[];
  cells?: { i?: ArrayLike<unknown> };
}

function defaultColorFor(i: number): string {
  return `url(#hatch${i % 42})`;
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

export const defaultAddZoneRuntime: AddZoneRuntime = {
  validateCells(cells: number[]): ValidateCellsResult {
    if (cells.length === 0) return { ok: true };
    const pack = getPack<AddZonePackLike>();
    const cellIds = pack?.cells?.i;
    if (cellIds && typeof cellIds.length === "number") {
      const max = cellIds.length;
      for (const c of cells) {
        if (c >= max) {
          return {
            ok: false,
            error: `Cell index ${c} is out of range (pack.cells has ${max} cells).`,
          };
        }
      }
    }
    return { ok: true };
  },
  add(input: AddZoneInput): NewZone {
    const pack = getPack<AddZonePackLike>();
    const zones = pack?.zones;
    if (!Array.isArray(zones)) {
      throw new Error("pack.zones is not available.");
    }
    const i = zones.length
      ? Math.max(...zones.map((z) => (typeof z?.i === "number" ? z.i : -1))) + 1
      : 0;
    if (zones.some((z) => z?.i === i)) {
      throw new Error(`Zone id ${i} already exists (pack.zones inconsistent).`);
    }
    const cells = dedupePreserveOrder(input.cells ?? []);
    const color = input.color ?? defaultColorFor(i);
    const zone: RawZone = {
      i,
      name: input.name,
      type: input.type,
      color,
      cells,
    };
    zones.push(zone);

    const draw = getGlobal<() => void>("drawZones");
    if (typeof draw === "function") {
      try {
        draw();
      } catch {
        // Best-effort: the data mutation already happened.
      }
    }

    return {
      i,
      name: input.name,
      type: input.type,
      color,
      cells,
    };
  },
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function createAddZoneTool(
  runtime: AddZoneRuntime = defaultAddZoneRuntime,
): Tool {
  return {
    name: "add_zone",
    description:
      'Create a new zone entry in pack.zones — same side-effect as the "Add zone" button in the Zones Editor. Requires `name` (the "Description" column in the Zones Overview — zone.name is what the editor\'s description field writes) and `type` (free-form: Invasion / Rebels / Proselytism / Crusade / Disease / Disaster / Eruption / Avalanche / Flood / …). Optional `color` (CSS color, or a `url(#...)` pattern reference; defaults to `url(#hatch{i%42})` like the editor) and `cells` (number[] of cell indices, default empty). Assigns a fresh id as `max(z.i) + 1` (or 0 for the first zone), pushes the new zone, and best-effort calls drawZones() to render. Cells are validated against pack.cells.i; duplicates are silently collapsed. Follow up with set_zone_color / set_zone_type / rename_zone / set_zone_visibility to tweak.',
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            'Zone description / label (Zones Overview\'s "Description" column — editor calls it description but writes zone.name). Required, non-empty.',
        },
        type: {
          type: "string",
          description:
            "Free-form type. Generator-known values: Invasion, Rebels, Proselytism, Crusade, Disease, Disaster, Eruption, Avalanche, Flood. Any non-empty string is accepted. Required.",
        },
        color: {
          type: "string",
          description:
            "CSS color (hex / rgb()/rgba() / hsl()/hsla() / named) or a `url(#...)` pattern reference. Defaults to `url(#hatch{i%42})`.",
        },
        cells: {
          type: "array",
          items: { type: "integer", minimum: 0 },
          description:
            "Optional cell indices to assign to the zone. Defaults to empty. Each entry must be a valid cell id in pack.cells; duplicates are collapsed.",
        },
      },
      required: ["name", "type"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as {
        name?: unknown;
        type?: unknown;
        color?: unknown;
        cells?: unknown;
      };

      if (!isNonEmptyString(input.name)) {
        return errorResult("name must be a non-empty string.");
      }
      if (!isNonEmptyString(input.type)) {
        return errorResult("type must be a non-empty string.");
      }
      if (input.color !== undefined && input.color !== null) {
        if (!isNonEmptyString(input.color)) {
          return errorResult("color, if provided, must be a non-empty string.");
        }
      }

      let cells: number[] = [];
      if (input.cells !== undefined && input.cells !== null) {
        if (!Array.isArray(input.cells)) {
          return errorResult("cells, if provided, must be an array.");
        }
        for (const v of input.cells) {
          if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
            return errorResult(
              "cells must contain only non-negative integers.",
            );
          }
        }
        cells = input.cells as number[];
      }

      const cellCheck = runtime.validateCells(cells);
      if (!cellCheck.ok) {
        return errorResult(cellCheck.error);
      }

      const zoneInput: AddZoneInput = {
        name: input.name.trim(),
        type: input.type.trim(),
        color: typeof input.color === "string" ? input.color.trim() : undefined,
        cells,
      };

      try {
        const created = runtime.add(zoneInput);
        return okResult({
          i: created.i,
          name: created.name,
          type: created.type,
          color: created.color,
          cells: created.cells,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  };
}

export const addZoneTool = createAddZoneTool();
