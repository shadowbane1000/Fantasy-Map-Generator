import { errorResult, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface NamedRef {
  id: number;
  name: string | null;
}

export interface CellFeatureInfo {
  id: number;
  type: string | null;
  group: string | null;
  land: boolean | null;
  border: boolean | null;
  name: string | null;
}

export interface CellInfo {
  cell: number;
  x: number | null;
  y: number | null;
  height: number | null;
  biome: NamedRef;
  temperature: number | null;
  precipitation: number | null;
  population: number | null;
  state: NamedRef;
  province: NamedRef;
  culture: NamedRef;
  religion: NamedRef;
  burg: NamedRef | null;
  river: NamedRef | null;
  feature: CellFeatureInfo | null;
  neighbors: number[];
}

export type ReadCellResult = CellInfo | "not-ready" | "out-of-bounds";

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  cells?: {
    i?: ArrayLike<number>;
    c?: ArrayLike<ArrayLike<number>>;
    p?: ArrayLike<[number, number] | undefined>;
    h?: ArrayLike<number>;
    g?: ArrayLike<number>;
    biome?: ArrayLike<number>;
    pop?: ArrayLike<number>;
    state?: ArrayLike<number>;
    province?: ArrayLike<number>;
    culture?: ArrayLike<number>;
    religion?: ArrayLike<number>;
    burg?: ArrayLike<number>;
    r?: ArrayLike<number>;
    f?: ArrayLike<number>;
  };
  states?: ArrayLike<{ name?: string } | undefined>;
  provinces?: ArrayLike<{ name?: string } | undefined>;
  cultures?: ArrayLike<{ name?: string } | undefined>;
  religions?: ArrayLike<{ name?: string } | undefined>;
  burgs?: ArrayLike<{ name?: string } | undefined>;
  rivers?: Array<{ i?: number; name?: string } | undefined>;
  features?: ArrayLike<
    | {
        i?: number;
        type?: string;
        group?: string;
        land?: boolean;
        border?: boolean;
        name?: string;
      }
    | undefined
  >;
}

interface GridLike {
  cells?: {
    temp?: ArrayLike<number>;
    prec?: ArrayLike<number>;
  };
}

interface BiomesLike {
  name?: ArrayLike<string>;
}

function getName(
  arr: ArrayLike<{ name?: string } | undefined> | undefined,
  id: number | undefined,
): string | null {
  if (arr === undefined || id === undefined) return null;
  if (id < 0 || id >= arr.length) return null;
  const entry = arr[id];
  if (!entry) return null;
  return typeof entry.name === "string" ? entry.name : null;
}

function namedRefOr(
  arr: ArrayLike<{ name?: string } | undefined> | undefined,
  id: number,
): NamedRef {
  return { id, name: getName(arr, id) };
}

function readScalar<T extends number>(
  arr: ArrayLike<T> | undefined,
  cell: number,
): T | null {
  if (!arr || cell < 0 || cell >= arr.length) return null;
  const v = arr[cell];
  return typeof v === "number" ? v : null;
}

export function readCellFromState(
  pack: PackLike | undefined,
  grid: GridLike | undefined,
  biomesData: BiomesLike | undefined,
  cell: number,
): ReadCellResult {
  if (!pack || !pack.cells || !pack.cells.i) return "not-ready";
  const cellsIndex = pack.cells.i;
  if (cell < 0 || cell >= cellsIndex.length) return "out-of-bounds";

  const cells = pack.cells;
  const point = cells.p?.[cell];
  const x = Array.isArray(point) ? (point[0] ?? null) : null;
  const y = Array.isArray(point) ? (point[1] ?? null) : null;

  const biomeId = cells.biome?.[cell] ?? 0;
  const biomeName =
    typeof biomesData?.name?.[biomeId] === "string"
      ? biomesData.name[biomeId]
      : null;

  // Temperature and precipitation live on grid.cells, accessed via the
  // packed cell's grid-cell pointer (pack.cells.g[i]).
  const gridCell = cells.g?.[cell];
  const temperature =
    typeof gridCell === "number"
      ? (readScalar(grid?.cells?.temp, gridCell) ?? null)
      : null;
  const precipitation =
    typeof gridCell === "number"
      ? (readScalar(grid?.cells?.prec, gridCell) ?? null)
      : null;

  const stateId = cells.state?.[cell] ?? 0;
  const provinceId = cells.province?.[cell] ?? 0;
  const cultureId = cells.culture?.[cell] ?? 0;
  const religionId = cells.religion?.[cell] ?? 0;
  const burgId = cells.burg?.[cell] ?? 0;
  const riverId = cells.r?.[cell] ?? 0;
  const featureId = cells.f?.[cell] ?? 0;

  // Rivers are a non-contiguous array keyed by `.i`.
  let river: NamedRef | null = null;
  if (riverId && pack.rivers) {
    const found = pack.rivers.find((r) => r && r.i === riverId);
    river = {
      id: riverId,
      name: found && typeof found.name === "string" ? found.name : null,
    };
  }

  let feature: CellFeatureInfo | null = null;
  if (featureId && pack.features) {
    const f = pack.features[featureId];
    if (f) {
      feature = {
        id: typeof f.i === "number" ? f.i : featureId,
        type: typeof f.type === "string" ? f.type : null,
        group: typeof f.group === "string" ? f.group : null,
        land: typeof f.land === "boolean" ? f.land : null,
        border: typeof f.border === "boolean" ? f.border : null,
        name: typeof f.name === "string" ? f.name : null,
      };
    }
  }

  const neighborsRaw = cells.c?.[cell];
  const neighbors: number[] = [];
  if (neighborsRaw) {
    for (let k = 0; k < neighborsRaw.length; k++) {
      const n = neighborsRaw[k];
      if (typeof n === "number") neighbors.push(n);
    }
  }

  return {
    cell,
    x: typeof x === "number" ? x : null,
    y: typeof y === "number" ? y : null,
    height: readScalar(cells.h, cell),
    biome: { id: biomeId, name: biomeName },
    temperature,
    precipitation,
    population: readScalar(cells.pop, cell),
    state: namedRefOr(pack.states, stateId),
    province: namedRefOr(pack.provinces, provinceId),
    culture: namedRefOr(pack.cultures, cultureId),
    religion: namedRefOr(pack.religions, religionId),
    burg: burgId ? namedRefOr(pack.burgs, burgId) : null,
    river,
    feature,
    neighbors,
  };
}

export interface CellInfoRuntime {
  readCell(cell: number): ReadCellResult;
}

export const defaultCellInfoRuntime: CellInfoRuntime = {
  readCell(cell: number): ReadCellResult {
    const globals = globalThis as unknown as {
      pack?: PackLike;
      grid?: GridLike;
      biomesData?: BiomesLike;
    };
    return readCellFromState(
      globals.pack,
      globals.grid,
      globals.biomesData,
      cell,
    );
  },
};

export function createGetCellInfoTool(
  runtime: CellInfoRuntime = defaultCellInfoRuntime,
): Tool {
  return {
    name: "get_cell_info",
    description:
      "Read every meaningful property of a single packed-grid cell — the per-cell parallel of get_map_info. Returns height (0-100), biome id + name, temperature (°C) and precipitation from grid.cells via the cell's g pointer, population, coordinates, and resolved id+name pairs for state, province, culture, religion, burg, and river (null for empty / 0 slots). Feature info (id, type, group, land, border, name) reports the landmass / ocean / lake the cell belongs to. Neighbors is the plain-array copy of pack.cells.c[cell]. Useful before taking any cell-targeted action (add_burg, add_culture, add_marker, add_regiment, …). Requires an Anthropic API key (see 'Getting an API key' below).",
    input_schema: {
      type: "object",
      properties: {
        cell: {
          type: "integer",
          minimum: 0,
          description:
            "Packed-grid cell index (must be < pack.cells.i.length).",
        },
      },
      required: ["cell"],
    },
    execute(input: unknown): ToolResult {
      const args = (input ?? {}) as { cell?: unknown };
      if (
        typeof args.cell !== "number" ||
        !Number.isInteger(args.cell) ||
        !Number.isFinite(args.cell)
      ) {
        return errorResult("cell is required and must be an integer.");
      }
      const result = runtime.readCell(args.cell);
      if (result === "not-ready") {
        return errorResult(
          "Map is not ready yet. Wait for the map to finish generating (listen for the 'map:generated' event on window).",
        );
      }
      if (result === "out-of-bounds") {
        return errorResult(
          `cell ${args.cell} is out of bounds of pack.cells.i.`,
        );
      }
      return okResult({ ...result });
    },
  };
}

export const getCellInfoTool = createGetCellInfoTool();
