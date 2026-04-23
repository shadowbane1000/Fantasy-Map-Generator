import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellsByPrecipitationRangeTool,
  DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
  defaultFindCellsByPrecipitationRangeRuntime,
  type FindCellsByPrecipitationRangeResult,
  type FindCellsByPrecipitationRangeRuntime,
  findCellsByPrecipitationRangeInPack,
  findCellsByPrecipitationRangeTool,
  MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
  MAX_PRECIPITATION,
  MIN_PRECIPITATION,
} from "./find-cells-by-precipitation-range";

interface FakePack {
  cells: {
    // Pack cell i -> grid cell g[i].
    // 10 pack cells mapping 1:1 to 10 grid cells for simplicity.
    g: number[];
  };
}

interface FakeGrid {
  cells: {
    // Precipitation spread: dry (0) → very wet (250).
    prec: number[];
  };
}

function makePack(): FakePack {
  return {
    cells: {
      g: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    },
  };
}

function makeGrid(): FakeGrid {
  return {
    cells: {
      prec: [0, 5, 18, 20, 20, 25, 40, 60, 80, 250],
    },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<
    typeof findCellsByPrecipitationRangeInPack
  >[0];
}

function asGrid(g: FakeGrid) {
  return g as unknown as Parameters<
    typeof findCellsByPrecipitationRangeInPack
  >[1];
}

function runtimeReturning(
  result: FindCellsByPrecipitationRangeResult,
): FindCellsByPrecipitationRangeRuntime {
  return { find: () => result };
}

function realRuntime(): FindCellsByPrecipitationRangeRuntime {
  const pack = asPack(makePack());
  const grid = asGrid(makeGrid());
  return {
    find: (min, max, limit) =>
      findCellsByPrecipitationRangeInPack(pack, grid, min, max, limit),
  };
}

describe("find_cells_by_precipitation_range — pure collector", () => {
  it("collects cells inside a mid-range band", () => {
    const result = findCellsByPrecipitationRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      20,
      40,
      DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4, 5, 6], count: 4 });
  });

  it("includes both boundary values (inclusive range)", () => {
    // min=5 matches index 1 (prec=5); max=80 matches index 8 (prec=80).
    const result = findCellsByPrecipitationRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      5,
      80,
      DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [1, 2, 3, 4, 5, 6, 7, 8],
      count: 8,
    });
  });

  it("single-value range returns exactly those cells", () => {
    // Two cells with prec=20 (indices 3 and 4).
    const result = findCellsByPrecipitationRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      20,
      20,
      DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4], count: 2 });
  });

  it("full [0, 255] range collects every cell", () => {
    const result = findCellsByPrecipitationRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      0,
      255,
      DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      count: 10,
    });
  });

  it("returns empty cells and count=0 when no cell matches", () => {
    // No cell sits in prec=100..200 in our fixture.
    const result = findCellsByPrecipitationRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      100,
      200,
      DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [], count: 0 });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findCellsByPrecipitationRangeInPack(
      asPack(makePack()),
      asGrid(makeGrid()),
      0,
      255,
      3,
    );
    expect(result).toEqual({ cells: [0, 1, 2], count: 10 });
  });

  it("resolves pack → grid indirection (non-identity mapping)", () => {
    // Pack cells 0..4 map to a reversed slice of grid cells.
    const pack = asPack({ cells: { g: [9, 8, 7, 6, 5] } });
    const grid = asGrid({
      cells: { prec: [0, 0, 0, 0, 0, 10, 20, 30, 40, 250] },
    });
    // prec values seen via pack order: [250, 40, 30, 20, 10].
    // Filter 20..40 → pack indices 1, 2, 3 (prec 40, 30, 20).
    const result = findCellsByPrecipitationRangeInPack(
      pack,
      grid,
      20,
      40,
      DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [1, 2, 3], count: 3 });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findCellsByPrecipitationRangeInPack(
        undefined,
        asGrid(makeGrid()),
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findCellsByPrecipitationRangeInPack
    >[0];
    expect(
      findCellsByPrecipitationRangeInPack(
        pack,
        asGrid(makeGrid()),
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.g is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof findCellsByPrecipitationRangeInPack
    >[0];
    expect(
      findCellsByPrecipitationRangeInPack(
        pack,
        asGrid(makeGrid()),
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when grid is missing", () => {
    expect(
      findCellsByPrecipitationRangeInPack(
        asPack(makePack()),
        undefined,
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when grid.cells is missing", () => {
    const grid = {} as unknown as Parameters<
      typeof findCellsByPrecipitationRangeInPack
    >[1];
    expect(
      findCellsByPrecipitationRangeInPack(
        asPack(makePack()),
        grid,
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when grid.cells.prec is missing", () => {
    const grid = { cells: {} } as unknown as Parameters<
      typeof findCellsByPrecipitationRangeInPack
    >[1];
    expect(
      findCellsByPrecipitationRangeInPack(
        asPack(makePack()),
        grid,
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_cells_by_precipitation_range — tool surface", () => {
  it("returns ok=true with the resolved cells and count", async () => {
    const tool = createFindCellsByPrecipitationRangeTool(realRuntime());
    const result = await tool.execute({ min: 20, max: 40 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      min: 20,
      max: 40,
      cells: [3, 4, 5, 6],
      count: 4,
    });
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindCellsByPrecipitationRangeTool(realRuntime());
    const result = await tool.execute({ min: 0, max: 255, limit: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(3);
    expect(body.count).toBe(10);
  });

  it("rejects missing / invalid min", async () => {
    const tool = createFindCellsByPrecipitationRangeTool(realRuntime());
    for (const bad of [
      { max: 50 },
      { min: -1, max: 50 },
      { min: 256, max: 50 },
      { min: 1.5, max: 50 },
      { min: "20", max: 50 },
      { min: null, max: 50 },
      { min: true, max: 50 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /min must be an integer in \[0, 255\]/,
      );
    }
  });

  it("rejects missing / invalid max", async () => {
    const tool = createFindCellsByPrecipitationRangeTool(realRuntime());
    for (const bad of [
      { min: 0 },
      { min: 0, max: -1 },
      { min: 0, max: 256 },
      { min: 0, max: 1.5 },
      { min: 0, max: "50" },
      { min: 0, max: null },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /max must be an integer in \[0, 255\]/,
      );
    }
  });

  it("rejects min > max", async () => {
    const tool = createFindCellsByPrecipitationRangeTool(realRuntime());
    const r = await tool.execute({ min: 80, max: 20 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/min must be <= max/);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCellsByPrecipitationRangeTool(realRuntime());
    for (const bad of [
      { min: 0, max: 255, limit: 0 },
      { min: 0, max: 255, limit: -1 },
      { min: 0, max: 255, limit: 1.5 },
      { min: 0, max: 255, limit: "10" },
      {
        min: 0,
        max: 255,
        limit: MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT + 1,
      },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsByPrecipitationRangeTool(
      runtimeReturning("not-ready"),
    );
    const r = await tool.execute({ min: 0, max: 255 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindCellsByPrecipitationRangeRuntime = {
      find: (_min, _max, limit) => {
        received = limit;
        return { cells: [], count: 0 };
      },
    };
    const tool = createFindCellsByPrecipitationRangeTool(runtime);
    await tool.execute({ min: 0, max: 255 });
    expect(received).toBe(DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT);
  });

  it("is exported as findCellsByPrecipitationRangeTool with expected schema", () => {
    expect(findCellsByPrecipitationRangeTool.name).toBe(
      "find_cells_by_precipitation_range",
    );
    expect(findCellsByPrecipitationRangeTool.input_schema.type).toBe("object");
    expect(findCellsByPrecipitationRangeTool.input_schema.required).toEqual([
      "min",
      "max",
    ]);
    expect(
      findCellsByPrecipitationRangeTool.input_schema.properties.min,
    ).toBeDefined();
    expect(
      findCellsByPrecipitationRangeTool.input_schema.properties.max,
    ).toBeDefined();
    expect(
      findCellsByPrecipitationRangeTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit and MIN / MAX_PRECIPITATION constants", () => {
    expect(DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT).toBe(100000);
    expect(MIN_PRECIPITATION).toBe(0);
    expect(MAX_PRECIPITATION).toBe(255);
  });
});

// ----- defaultFindCellsByPrecipitationRangeRuntime integration -----

describe("defaultFindCellsByPrecipitationRangeRuntime (integration)", () => {
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

  it("reads real pack + grid via the default runtime (happy path)", () => {
    const result = defaultFindCellsByPrecipitationRangeRuntime.find(
      20,
      40,
      DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4, 5, 6], count: 4 });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findCellsByPrecipitationRangeTool.execute({
      min: 0,
      max: 19,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      min: 0,
      max: 19,
      cells: [0, 1, 2],
      count: 3,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCellsByPrecipitationRangeRuntime.find(
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByPrecipitationRangeTool.execute({
      min: 0,
      max: 255,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when grid is missing → tool surfaces error", async () => {
    globalsRef.grid = undefined;
    expect(
      defaultFindCellsByPrecipitationRangeRuntime.find(
        0,
        255,
        DEFAULT_FIND_CELLS_BY_PRECIPITATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByPrecipitationRangeTool.execute({
      min: 0,
      max: 255,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
