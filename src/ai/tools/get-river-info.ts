import {
  errorResult,
  getPack,
  okResult,
  parseEntityRef,
  type RawRiver,
} from "./_shared";
import type { Tool, ToolResult } from "./index";
import { findRiverByRef } from "./rename-river";

export interface RiverRef {
  id: number;
  name: string | null;
}

export interface RiverCellRef {
  cell: number;
  x: number | null;
  y: number | null;
}

export interface RiverInfo {
  i: number;
  name: string;
  type: string | null;
  parent: RiverRef | null;
  basin: RiverRef | null;
  source: RiverCellRef | null;
  mouth: RiverCellRef | null;
  length: number;
  discharge: number;
  widthFactor: number;
  cells: number;
}

export type ReadRiverInfoResult = RiverInfo | "not-ready" | "not-found";

export interface RiverInfoPackLike {
  rivers?: RawRiver[];
  cells?: {
    p?: Array<[number, number] | number[] | undefined>;
    r?: Array<number | undefined> | number[];
  };
}

function readCellPoint(
  pack: RiverInfoPackLike | undefined,
  cell: number | undefined,
): { x: number | null; y: number | null } {
  if (typeof cell !== "number") return { x: null, y: null };
  const p = pack?.cells?.p?.[cell];
  if (!Array.isArray(p)) return { x: null, y: null };
  const x = typeof p[0] === "number" ? p[0] : null;
  const y = typeof p[1] === "number" ? p[1] : null;
  return { x, y };
}

function nameForRiverId(
  rivers: RawRiver[] | undefined,
  id: number,
): string | null {
  if (!rivers) return null;
  for (const r of rivers) {
    if (!r || r.removed) continue;
    if (r.i === id) return r.name ?? null;
  }
  return null;
}

function countRiverCells(
  pack: RiverInfoPackLike | undefined,
  river: RawRiver,
): number {
  if (Array.isArray(river.cells) && river.cells.length > 0) {
    return river.cells.length;
  }
  const r = pack?.cells?.r;
  if (!r) return 0;
  let count = 0;
  const len = (r as { length: number }).length;
  const arr = r as Array<number | undefined>;
  for (let k = 0; k < len; k++) {
    if (arr[k] === river.i) count += 1;
  }
  return count;
}

export function readRiverInfoFromPack(
  pack: RiverInfoPackLike | undefined,
  ref: number | string,
): ReadRiverInfoResult {
  if (!pack?.rivers) return "not-ready";
  const entry = findRiverByRef(pack.rivers, ref);
  if (!entry) return "not-found";
  if (entry.i <= 0) return "not-found";

  const riverI = entry.i;

  let parent: RiverRef | null = null;
  if (typeof entry.parent === "number" && entry.parent !== riverI) {
    parent = {
      id: entry.parent,
      name: nameForRiverId(pack.rivers, entry.parent),
    };
  }

  let basin: RiverRef | null = null;
  if (typeof entry.basin === "number") {
    basin = {
      id: entry.basin,
      name: nameForRiverId(pack.rivers, entry.basin),
    };
  }

  let source: RiverCellRef | null = null;
  if (typeof entry.source === "number") {
    const { x, y } = readCellPoint(pack, entry.source);
    source = { cell: entry.source, x, y };
  }

  let mouth: RiverCellRef | null = null;
  if (typeof entry.mouth === "number") {
    const { x, y } = readCellPoint(pack, entry.mouth);
    mouth = { cell: entry.mouth, x, y };
  }

  return {
    i: riverI,
    name: entry.name ?? "",
    type: entry.type ?? null,
    parent,
    basin,
    source,
    mouth,
    length: typeof entry.length === "number" ? entry.length : 0,
    discharge: typeof entry.discharge === "number" ? entry.discharge : 0,
    widthFactor: typeof entry.widthFactor === "number" ? entry.widthFactor : 0,
    cells: countRiverCells(pack, entry),
  };
}

export interface RiverInfoRuntime {
  readRiverInfo(ref: number | string): ReadRiverInfoResult;
}

export const defaultRiverInfoRuntime: RiverInfoRuntime = {
  readRiverInfo(ref: number | string): ReadRiverInfoResult {
    return readRiverInfoFromPack(getPack<RiverInfoPackLike>(), ref);
  },
};

export function createGetRiverInfoTool(
  runtime: RiverInfoRuntime = defaultRiverInfoRuntime,
): Tool {
  return {
    name: "get_river_info",
    description:
      "Read detailed info for a single river — the per-river parallel of get_burg_info / get_state_info / get_culture_info / get_religion_info. Required `river` is a numeric river id (matches river.i, not array index — ids are non-contiguous because the generator skips removed rivers) OR the river's current case-insensitive name, resolved via the shared findRiverByRef (which skips removed rivers). Returns `i`, `name`, `type` (River / Stream / Creek / Branch / Fork / …), `parent` ({id, name} from pack.rivers; null when river.parent is unset OR river.parent === river.i — the generator self-references rivers that have no real parent), `basin` ({id, name} from pack.rivers; null when unset), `source` / `mouth` ({cell, x, y} from pack.cells.p — the cell id with its SVG coords, null when the field is absent), `length`, `discharge` (m³/s), `widthFactor`, and `cells` (count of cells along this river — uses river.cells.length when tracked, falling back to counting pack.cells.r[] === river.i). Useful before rename_river, remove_river, set_river_type, set_river_width, or regenerate_river_names. Errors on missing / invalid `river`, unknown refs, removed rivers, or an un-generated map. Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        river: {
          type: ["integer", "string"],
          description:
            "Numeric river id (matches river.i, not array index) or the river's current name (case-insensitive).",
        },
      },
      required: ["river"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { river?: unknown };
      const parsed = parseEntityRef(input.river, "river");
      if (!parsed.ok) return errorResult(parsed.error);

      const result = runtime.readRiverInfo(parsed.ref);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "not-found") {
        return errorResult(
          `No river found matching ${JSON.stringify(parsed.ref)}.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getRiverInfoTool = createGetRiverInfoTool();
