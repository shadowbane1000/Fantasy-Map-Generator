import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CellInfo,
  type CellInfoRuntime,
  createGetCellInfoTool,
  defaultCellInfoRuntime,
  getCellInfoTool,
  type ReadCellResult,
  readCellFromState,
} from "./get-cell-info";

interface FakePack {
  cells: {
    i: number[];
    c: number[][];
    p: Array<[number, number]>;
    h: number[];
    g: number[];
    biome: number[];
    pop: number[];
    state: number[];
    province: number[];
    culture: number[];
    religion: number[];
    burg: number[];
    r: number[];
    f: number[];
  };
  states: Array<{ name?: string } | undefined>;
  provinces: Array<{ name?: string } | undefined>;
  cultures: Array<{ name?: string } | undefined>;
  religions: Array<{ name?: string } | undefined>;
  burgs: Array<{ name?: string } | undefined>;
  rivers: Array<{ i: number; name: string }>;
  features: Array<
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

interface FakeGrid {
  cells: { temp: number[]; prec: number[] };
}

interface FakeBiomes {
  name: string[];
}

function makePack(): FakePack {
  // 3 packed cells. Cell 1 has everything set; Cell 2 has all neutrals.
  // Cell 0 is reserved as a border-ish placeholder.
  return {
    cells: {
      i: [0, 1, 2],
      c: [
        [1, 2],
        [0, 2],
        [0, 1],
      ],
      p: [
        [10, 20],
        [100, 200],
        [500, 600],
      ],
      h: [0, 45, 12],
      g: [0, 17, 18],
      biome: [0, 6, 0],
      pop: [0, 500, 0],
      state: [0, 3, 0],
      province: [0, 4, 0],
      culture: [0, 2, 0],
      religion: [0, 5, 0],
      burg: [0, 7, 0],
      r: [0, 42, 0],
      f: [0, 1, 0],
    },
    states: [{ name: "Neutrals" }, undefined, undefined, { name: "Altaria" }],
    provinces: [
      undefined,
      undefined,
      undefined,
      undefined,
      { name: "Rookmark" },
    ],
    cultures: [{ name: "Wildlands" }, undefined, { name: "Highlanders" }],
    religions: [
      { name: "No religion" },
      undefined,
      undefined,
      undefined,
      undefined,
      { name: "Old Faith" },
    ],
    burgs: [
      { name: "placeholder" },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { name: "Stormport" },
    ],
    rivers: [{ i: 42, name: "Ashwater" }],
    features: [
      undefined,
      {
        i: 1,
        type: "island",
        group: "isle",
        land: true,
        border: false,
        name: "Elder Isle",
      },
    ],
  };
}

function makeGrid(): FakeGrid {
  const temp = new Array(25).fill(0);
  const prec = new Array(25).fill(0);
  // cell 1 has g=17, cell 2 has g=18.
  temp[17] = 14;
  temp[18] = -3;
  prec[17] = 50;
  prec[18] = 4;
  return { cells: { temp, prec } };
}

function makeBiomes(): FakeBiomes {
  return {
    name: [
      "Marine",
      "Hot desert",
      "Cold desert",
      "Savanna",
      "Grassland",
      "Tropical seasonal forest",
      "Temperate deciduous forest",
    ],
  };
}

function runtimeReturning(result: ReadCellResult): CellInfoRuntime {
  return { readCell: () => result };
}

function pureRead(cell: number): ReadCellResult {
  return readCellFromState(makePack(), makeGrid(), makeBiomes(), cell);
}

describe("get_cell_info tool — pure / seam", () => {
  it("returns all fields for a fully populated cell", async () => {
    const info = pureRead(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("out-of-bounds");
    const tool = createGetCellInfoTool(runtimeReturning(info));
    const result = await tool.execute({ cell: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.cell).toBe(1);
    expect(body.x).toBe(100);
    expect(body.y).toBe(200);
    expect(body.height).toBe(45);
    expect(body.biome).toEqual({
      id: 6,
      name: "Temperate deciduous forest",
    });
    expect(body.temperature).toBe(14);
    expect(body.precipitation).toBe(50);
    expect(body.population).toBe(500);
    expect(body.state).toEqual({ id: 3, name: "Altaria" });
    expect(body.province).toEqual({ id: 4, name: "Rookmark" });
    expect(body.culture).toEqual({ id: 2, name: "Highlanders" });
    expect(body.religion).toEqual({ id: 5, name: "Old Faith" });
    expect(body.burg).toEqual({ id: 7, name: "Stormport" });
    expect(body.river).toEqual({ id: 42, name: "Ashwater" });
    expect(body.feature).toEqual({
      id: 1,
      type: "island",
      group: "isle",
      land: true,
      border: false,
      name: "Elder Isle",
    });
    expect(body.neighbors).toEqual([0, 2]);
  });

  it("resolves temperature and precipitation via pack.cells.g[i] indirection", () => {
    const info = pureRead(2) as CellInfo;
    // Cell 2 has g=18 → temp[18]=-3, prec[18]=4.
    expect(info.temperature).toBe(-3);
    expect(info.precipitation).toBe(4);
  });

  it("returns {id:0,name:null} for neutral state/province/culture/religion slots and null for burg/river", () => {
    const info = pureRead(2) as CellInfo;
    expect(info.state).toEqual({ id: 0, name: "Neutrals" });
    expect(info.province).toEqual({ id: 0, name: null });
    expect(info.culture).toEqual({ id: 0, name: "Wildlands" });
    expect(info.religion).toEqual({ id: 0, name: "No religion" });
    expect(info.burg).toBeNull();
    expect(info.river).toBeNull();
    expect(info.feature).toBeNull();
  });

  it("feature resolution preserves id/type/group/land/border/name", () => {
    const info = pureRead(1) as CellInfo;
    expect(info.feature).toEqual({
      id: 1,
      type: "island",
      group: "isle",
      land: true,
      border: false,
      name: "Elder Isle",
    });
  });

  it("river id that exists in pack.rivers resolves by .i", () => {
    const info = pureRead(1) as CellInfo;
    expect(info.river).toEqual({ id: 42, name: "Ashwater" });
  });

  it("unknown river id returns { id, name: null }", () => {
    const pack = makePack();
    pack.cells.r[1] = 999;
    const info = readCellFromState(pack, makeGrid(), makeBiomes(), 1);
    expect(info).not.toBe("not-ready");
    expect((info as CellInfo).river).toEqual({ id: 999, name: null });
  });

  it("neighbors mirror pack.cells.c[i] as a plain array", () => {
    const info = pureRead(0) as CellInfo;
    expect(info.neighbors).toEqual([1, 2]);
  });

  it("echoes the requested cell index", () => {
    const info = pureRead(1) as CellInfo;
    expect(info.cell).toBe(1);
  });

  it("rejects out-of-bounds cell (negative)", async () => {
    const tool = createGetCellInfoTool({
      readCell: (cell) =>
        readCellFromState(makePack(), makeGrid(), makeBiomes(), cell),
    });
    const result = await tool.execute({ cell: -1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/out of bounds/i);
  });

  it("rejects out-of-bounds cell (>= length)", async () => {
    const tool = createGetCellInfoTool({
      readCell: (cell) =>
        readCellFromState(makePack(), makeGrid(), makeBiomes(), cell),
    });
    const result = await tool.execute({ cell: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of bounds/i);
  });

  it("rejects non-integer / missing cell", async () => {
    const tool = createGetCellInfoTool(
      runtimeReturning(pureRead(1) as CellInfo),
    );
    for (const bad of [{}, { cell: "1" }, { cell: 1.5 }, { cell: null }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/integer/i);
    }
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetCellInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ cell: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("biome name falls back to null when biomesData.name entry is missing", () => {
    const pack = makePack();
    pack.cells.biome[1] = 99;
    const info = readCellFromState(pack, makeGrid(), makeBiomes(), 1);
    expect((info as CellInfo).biome).toEqual({ id: 99, name: null });
  });

  it("is exported as getCellInfoTool with the expected schema", () => {
    expect(getCellInfoTool.name).toBe("get_cell_info");
    expect(getCellInfoTool.input_schema.type).toBe("object");
    expect(getCellInfoTool.input_schema.required).toEqual(["cell"]);
    expect(getCellInfoTool.input_schema.properties.cell).toBeDefined();
  });
});

// ----- defaultCellInfoRuntime integration -----

describe("defaultCellInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    grid?: unknown;
    biomesData?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalGrid = globalsRef.grid;
  const originalBiomes = globalsRef.biomesData;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.grid = makeGrid() as unknown;
    globalsRef.biomesData = makeBiomes() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.grid = originalGrid;
    globalsRef.biomesData = originalBiomes;
  });

  it("reads a real packed cell through the default runtime", () => {
    const info = defaultCellInfoRuntime.readCell(1);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("out-of-bounds");
    const ci = info as CellInfo;
    expect(ci.cell).toBe(1);
    expect(ci.state).toEqual({ id: 3, name: "Altaria" });
    expect(ci.biome).toEqual({
      id: 6,
      name: "Temperate deciduous forest",
    });
    expect(ci.temperature).toBe(14);
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultCellInfoRuntime.readCell(1)).toBe("not-ready");
    const result = await getCellInfoTool.execute({ cell: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'out-of-bounds' for cell >= cells.i.length", async () => {
    expect(defaultCellInfoRuntime.readCell(999)).toBe("out-of-bounds");
    const result = await getCellInfoTool.execute({ cell: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/out of bounds/i);
  });
});
