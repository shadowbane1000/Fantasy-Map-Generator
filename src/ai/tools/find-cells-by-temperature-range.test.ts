import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellsByTemperatureRangeTool,
  DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
  defaultFindCellsByTemperatureRangeRuntime,
  type FindCellsByTemperatureRangeResult,
  type FindCellsByTemperatureRangeRuntime,
  findCellsByTemperatureRangeInPack,
  findCellsByTemperatureRangeTool,
  MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
} from "./find-cells-by-temperature-range";

interface FakePack {
  cells: {
    i: number[];
    g: number[];
  };
}

interface FakeGrid {
  cells: {
    temp: number[];
  };
}

function makePack(): FakePack {
  // 10 pack cells, each mapped one-to-one onto a grid cell.
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      g: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    },
  };
}

function makeGrid(): FakeGrid {
  // Spread of temperatures in °C covering cold (-30 to -5), mid (0-20),
  // and hot (25-45).
  return {
    cells: {
      temp: [-30, -20, -5, 0, 10, 15, 20, 25, 35, 45],
    },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<
    typeof findCellsByTemperatureRangeInPack
  >[0];
}

function asGrid(g: FakeGrid) {
  return g as unknown as Parameters<
    typeof findCellsByTemperatureRangeInPack
  >[1];
}

function runtimeReturning(
  result: FindCellsByTemperatureRangeResult,
): FindCellsByTemperatureRangeRuntime {
  return { find: () => result };
}

function realRuntime(): FindCellsByTemperatureRangeRuntime {
  const pack = asPack(makePack());
  const grid = asGrid(makeGrid());
  return {
    find: (min, max, limit) =>
      findCellsByTemperatureRangeInPack(pack, grid, min, max, limit),
  };
}

describe("find_cells_by_temperature_range — pure collector", () => {
  it("collects cells inside a mid-range band", () => {
    const result = findCellsByTemperatureRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      0,
      20,
      DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4, 5, 6], count: 4 });
  });

  it("includes both boundary values (inclusive range)", () => {
    // min=-20 matches index 1 (t=-20); max=35 matches index 8 (t=35).
    const result = findCellsByTemperatureRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      -20,
      35,
      DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [1, 2, 3, 4, 5, 6, 7, 8],
      count: 8,
    });
  });

  it("single-value range returns exactly those cells", () => {
    // One cell at t=10 (index 4).
    const result = findCellsByTemperatureRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      10,
      10,
      DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [4], count: 1 });
  });

  it("full [-128, 127] range collects every cell", () => {
    const result = findCellsByTemperatureRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      -128,
      127,
      DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      count: 10,
    });
  });

  it("returns empty cells and count=0 when no cell matches", () => {
    // No cell sits in t=50..60 in our fixture.
    const result = findCellsByTemperatureRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      50,
      60,
      DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [], count: 0 });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findCellsByTemperatureRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      -128,
      127,
      3,
    );
    expect(result).toEqual({ cells: [0, 1, 2], count: 10 });
  });

  it("follows pack.cells.g indirection into grid.cells.temp", () => {
    // Rearrange g so pack cell 0 -> grid cell 9, etc.
    const pack: FakePack = {
      cells: { i: [0, 1, 2], g: [9, 0, 4] },
    };
    // temp[9] = 45, temp[0] = -30, temp[4] = 10.
    const grid = makeGrid();
    const result = findCellsByTemperatureRangeInPack(
      asPack(pack),
      asGrid(grid),
      0,
      50,
      DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
    );
    // pack[0]->grid[9]=45 (match), pack[1]->grid[0]=-30 (miss),
    // pack[2]->grid[4]=10 (match).
    expect(result).toEqual({ cells: [0, 2], count: 2 });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findCellsByTemperatureRangeInPack(
        undefined,
        asGrid(makeGrid()),
        0,
        50,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findCellsByTemperatureRangeInPack
    >[0];
    expect(
      findCellsByTemperatureRangeInPack(
        pack,
        asGrid(makeGrid()),
        0,
        50,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.g is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof findCellsByTemperatureRangeInPack
    >[0];
    expect(
      findCellsByTemperatureRangeInPack(
        pack,
        asGrid(makeGrid()),
        0,
        50,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when grid is missing", () => {
    expect(
      findCellsByTemperatureRangeInPack(
        asPack(makePack()),
        undefined,
        0,
        50,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when grid.cells is missing", () => {
    const grid = {} as unknown as Parameters<
      typeof findCellsByTemperatureRangeInPack
    >[1];
    expect(
      findCellsByTemperatureRangeInPack(
        asPack(makePack()),
        grid,
        0,
        50,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when grid.cells.temp is missing", () => {
    const grid = { cells: {} } as unknown as Parameters<
      typeof findCellsByTemperatureRangeInPack
    >[1];
    expect(
      findCellsByTemperatureRangeInPack(
        asPack(makePack()),
        grid,
        0,
        50,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_cells_by_temperature_range — tool surface", () => {
  it("returns ok=true with the resolved cells and count", async () => {
    const tool = createFindCellsByTemperatureRangeTool(realRuntime());
    const result = await tool.execute({ min: 0, max: 20 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      min: 0,
      max: 20,
      cells: [3, 4, 5, 6],
      count: 4,
    });
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindCellsByTemperatureRangeTool(realRuntime());
    const result = await tool.execute({ min: -128, max: 127, limit: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(3);
    expect(body.count).toBe(10);
  });

  it("rejects missing / invalid min", async () => {
    const tool = createFindCellsByTemperatureRangeTool(realRuntime());
    for (const bad of [
      { max: 50 },
      { min: -129, max: 50 },
      { min: 128, max: 50 },
      { min: 1.5, max: 50 },
      { min: "20", max: 50 },
      { min: null, max: 50 },
      { min: true, max: 50 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /min must be an integer in \[-128, 127\]/,
      );
    }
  });

  it("rejects missing / invalid max", async () => {
    const tool = createFindCellsByTemperatureRangeTool(realRuntime());
    for (const bad of [
      { min: 0 },
      { min: 0, max: -129 },
      { min: 0, max: 128 },
      { min: 0, max: 1.5 },
      { min: 0, max: "50" },
      { min: 0, max: null },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /max must be an integer in \[-128, 127\]/,
      );
    }
  });

  it("rejects min > max", async () => {
    const tool = createFindCellsByTemperatureRangeTool(realRuntime());
    const r = await tool.execute({ min: 30, max: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/min must be <= max/);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCellsByTemperatureRangeTool(realRuntime());
    for (const bad of [
      { min: -128, max: 127, limit: 0 },
      { min: -128, max: 127, limit: -1 },
      { min: -128, max: 127, limit: 1.5 },
      { min: -128, max: 127, limit: "10" },
      {
        min: -128,
        max: 127,
        limit: MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT + 1,
      },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsByTemperatureRangeTool(
      runtimeReturning("not-ready"),
    );
    const r = await tool.execute({ min: -128, max: 127 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindCellsByTemperatureRangeRuntime = {
      find: (_min, _max, limit) => {
        received = limit;
        return { cells: [], count: 0 };
      },
    };
    const tool = createFindCellsByTemperatureRangeTool(runtime);
    await tool.execute({ min: -128, max: 127 });
    expect(received).toBe(DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT);
  });

  it("is exported as findCellsByTemperatureRangeTool with the expected schema", () => {
    expect(findCellsByTemperatureRangeTool.name).toBe(
      "find_cells_by_temperature_range",
    );
    expect(findCellsByTemperatureRangeTool.input_schema.type).toBe("object");
    expect(findCellsByTemperatureRangeTool.input_schema.required).toEqual([
      "min",
      "max",
    ]);
    expect(
      findCellsByTemperatureRangeTool.input_schema.properties.min,
    ).toBeDefined();
    expect(
      findCellsByTemperatureRangeTool.input_schema.properties.max,
    ).toBeDefined();
    expect(
      findCellsByTemperatureRangeTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit and MIN_TEMPERATURE / MAX_TEMPERATURE constants", () => {
    expect(DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT).toBe(100000);
    expect(MIN_TEMPERATURE).toBe(-128);
    expect(MAX_TEMPERATURE).toBe(127);
  });
});

// ----- defaultFindCellsByTemperatureRangeRuntime integration -----

describe("defaultFindCellsByTemperatureRangeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    grid?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalGrid = globalsRef.grid;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.grid = makeGrid() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.grid = originalGrid;
  });

  it("reads real pack+grid via the default runtime (happy path)", () => {
    const result = defaultFindCellsByTemperatureRangeRuntime.find(
      0,
      20,
      DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4, 5, 6], count: 4 });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findCellsByTemperatureRangeTool.execute({
      min: -30,
      max: -5,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      min: -30,
      max: -5,
      cells: [0, 1, 2],
      count: 3,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCellsByTemperatureRangeRuntime.find(
        -128,
        127,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByTemperatureRangeTool.execute({
      min: -128,
      max: 127,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when grid is missing → tool surfaces error", async () => {
    globalsRef.grid = undefined;
    expect(
      defaultFindCellsByTemperatureRangeRuntime.find(
        -128,
        127,
        DEFAULT_FIND_CELLS_BY_TEMPERATURE_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByTemperatureRangeTool.execute({
      min: -128,
      max: 127,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
