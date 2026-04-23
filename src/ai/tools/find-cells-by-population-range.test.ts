import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellsByPopulationRangeTool,
  DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
  defaultFindCellsByPopulationRangeRuntime,
  type FindCellsByPopulationRangeResult,
  type FindCellsByPopulationRangeRuntime,
  findCellsByPopulationRangeInPack,
  findCellsByPopulationRangeTool,
  MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
  MIN_POPULATION,
} from "./find-cells-by-population-range";

interface FakePack {
  cells: {
    pop: number[];
  };
}

function makePack(): FakePack {
  // 10 cells with a spread of raw pre-scale population values:
  // indices 0-2 are empty (water / uninhabitable), index 3-6 are lightly
  // populated rural cells, 7-9 are dense hinterland clusters.
  return {
    cells: {
      pop: [0, 0, 0, 0.5, 1.25, 3.8, 8.2, 20, 42.6, 100],
    },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findCellsByPopulationRangeInPack>[0];
}

function runtimeReturning(
  result: FindCellsByPopulationRangeResult,
): FindCellsByPopulationRangeRuntime {
  return { find: () => result };
}

function realRuntime(): FindCellsByPopulationRangeRuntime {
  const pack = asPack(makePack());
  return {
    find: (min, max, limit) =>
      findCellsByPopulationRangeInPack(pack, min, max, limit),
  };
}

describe("find_cells_by_population_range — pure collector", () => {
  it("collects cells inside a mid-range band", () => {
    const result = findCellsByPopulationRangeInPack(
      asPack(makePack()),
      1,
      10,
      DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [4, 5, 6], count: 3 });
  });

  it("includes both boundary values (inclusive range)", () => {
    // min=0.5 matches index 3 (pop=0.5); max=42.6 matches index 8 (pop=42.6).
    const result = findCellsByPopulationRangeInPack(
      asPack(makePack()),
      0.5,
      42.6,
      DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [3, 4, 5, 6, 7, 8],
      count: 6,
    });
  });

  it("single-value range returns exactly those cells", () => {
    // Three cells at pop=0 (indices 0, 1, 2).
    const result = findCellsByPopulationRangeInPack(
      asPack(makePack()),
      0,
      0,
      DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [0, 1, 2], count: 3 });
  });

  it("wide range collects every cell", () => {
    const result = findCellsByPopulationRangeInPack(
      asPack(makePack()),
      0,
      1e9,
      DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      count: 10,
    });
  });

  it("returns empty cells and count=0 when no cell matches", () => {
    // No cell sits in pop=200..300 in our fixture.
    const result = findCellsByPopulationRangeInPack(
      asPack(makePack()),
      200,
      300,
      DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [], count: 0 });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findCellsByPopulationRangeInPack(
      asPack(makePack()),
      0,
      1e9,
      3,
    );
    expect(result).toEqual({ cells: [0, 1, 2], count: 10 });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findCellsByPopulationRangeInPack(
        undefined,
        0,
        1e9,
        DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findCellsByPopulationRangeInPack
    >[0];
    expect(
      findCellsByPopulationRangeInPack(
        pack,
        0,
        1e9,
        DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.pop is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof findCellsByPopulationRangeInPack
    >[0];
    expect(
      findCellsByPopulationRangeInPack(
        pack,
        0,
        1e9,
        DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_cells_by_population_range — tool surface", () => {
  it("returns ok=true with the resolved cells and count", async () => {
    const tool = createFindCellsByPopulationRangeTool(realRuntime());
    const result = await tool.execute({ min: 1, max: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      min: 1,
      max: 10,
      cells: [4, 5, 6],
      count: 3,
    });
  });

  it("accepts fractional min and max", async () => {
    const tool = createFindCellsByPopulationRangeTool(realRuntime());
    const result = await tool.execute({ min: 0.5, max: 4.5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      min: 0.5,
      max: 4.5,
      cells: [3, 4, 5],
      count: 3,
    });
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindCellsByPopulationRangeTool(realRuntime());
    const result = await tool.execute({ min: 0, max: 1e9, limit: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(3);
    expect(body.count).toBe(10);
  });

  it("rejects missing / invalid min", async () => {
    const tool = createFindCellsByPopulationRangeTool(realRuntime());
    for (const bad of [
      { max: 50 },
      { min: -1, max: 50 },
      { min: -0.1, max: 50 },
      { min: "20", max: 50 },
      { min: null, max: 50 },
      { min: true, max: 50 },
      { min: Number.NaN, max: 50 },
      { min: Number.POSITIVE_INFINITY, max: 50 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /min must be a finite number >= 0/,
      );
    }
  });

  it("rejects missing / invalid max", async () => {
    const tool = createFindCellsByPopulationRangeTool(realRuntime());
    for (const bad of [
      { min: 0 },
      { min: 0, max: -1 },
      { min: 0, max: -0.5 },
      { min: 0, max: "50" },
      { min: 0, max: null },
      { min: 0, max: Number.NaN },
      { min: 0, max: Number.POSITIVE_INFINITY },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /max must be a finite number >= 0/,
      );
    }
  });

  it("rejects min > max", async () => {
    const tool = createFindCellsByPopulationRangeTool(realRuntime());
    const r = await tool.execute({ min: 80, max: 20 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/min must be <= max/);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCellsByPopulationRangeTool(realRuntime());
    for (const bad of [
      { min: 0, max: 100, limit: 0 },
      { min: 0, max: 100, limit: -1 },
      { min: 0, max: 100, limit: 1.5 },
      { min: 0, max: 100, limit: "10" },
      { min: 0, max: 100, limit: MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsByPopulationRangeTool(
      runtimeReturning("not-ready"),
    );
    const r = await tool.execute({ min: 0, max: 100 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindCellsByPopulationRangeRuntime = {
      find: (_min, _max, limit) => {
        received = limit;
        return { cells: [], count: 0 };
      },
    };
    const tool = createFindCellsByPopulationRangeTool(runtime);
    await tool.execute({ min: 0, max: 100 });
    expect(received).toBe(DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT);
  });

  it("is exported as findCellsByPopulationRangeTool with the expected schema", () => {
    expect(findCellsByPopulationRangeTool.name).toBe(
      "find_cells_by_population_range",
    );
    expect(findCellsByPopulationRangeTool.input_schema.type).toBe("object");
    expect(findCellsByPopulationRangeTool.input_schema.required).toEqual([
      "min",
      "max",
    ]);
    expect(
      findCellsByPopulationRangeTool.input_schema.properties.min,
    ).toBeDefined();
    expect(
      findCellsByPopulationRangeTool.input_schema.properties.max,
    ).toBeDefined();
    expect(
      findCellsByPopulationRangeTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit and MIN_POPULATION constants", () => {
    expect(DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_BY_POPULATION_RANGE_LIMIT).toBe(100000);
    expect(MIN_POPULATION).toBe(0);
  });
});

// ----- defaultFindCellsByPopulationRangeRuntime integration -----

describe("defaultFindCellsByPopulationRangeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
  };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via the default runtime (happy path)", () => {
    const result = defaultFindCellsByPopulationRangeRuntime.find(
      1,
      10,
      DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [4, 5, 6], count: 3 });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findCellsByPopulationRangeTool.execute({
      min: 0,
      max: 0,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      min: 0,
      max: 0,
      cells: [0, 1, 2],
      count: 3,
    });
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindCellsByPopulationRangeRuntime.find(
        0,
        1e9,
        DEFAULT_FIND_CELLS_BY_POPULATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByPopulationRangeTool.execute({
      min: 0,
      max: 1e9,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
