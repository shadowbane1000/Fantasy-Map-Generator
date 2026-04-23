import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindCellsByHeightRangeTool,
  DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
  defaultFindCellsByHeightRangeRuntime,
  type FindCellsByHeightRangeResult,
  type FindCellsByHeightRangeRuntime,
  findCellsByHeightRangeInPack,
  findCellsByHeightRangeTool,
  MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
  MAX_HEIGHT,
  MIN_HEIGHT,
} from "./find-cells-by-height-range";

interface FakePack {
  cells: {
    h: number[];
  };
}

function makePack(): FakePack {
  // 10 cells with a spread of heights covering water (0-19), shore (20),
  // and land (>=21) up to a peak at 95.
  return {
    cells: {
      h: [0, 5, 18, 20, 20, 25, 40, 60, 80, 95],
    },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findCellsByHeightRangeInPack>[0];
}

function runtimeReturning(
  result: FindCellsByHeightRangeResult,
): FindCellsByHeightRangeRuntime {
  return { find: () => result };
}

function realRuntime(): FindCellsByHeightRangeRuntime {
  const pack = asPack(makePack());
  return {
    find: (min, max, limit) =>
      findCellsByHeightRangeInPack(pack, min, max, limit),
  };
}

describe("find_cells_by_height_range — pure collector", () => {
  it("collects cells inside a mid-range band", () => {
    const result = findCellsByHeightRangeInPack(
      asPack(makePack()),
      20,
      40,
      DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4, 5, 6], count: 4 });
  });

  it("includes both boundary values (inclusive range)", () => {
    // min=5 matches index 1 (h=5); max=80 matches index 8 (h=80).
    const result = findCellsByHeightRangeInPack(
      asPack(makePack()),
      5,
      80,
      DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [1, 2, 3, 4, 5, 6, 7, 8],
      count: 8,
    });
  });

  it("single-value range returns exactly those cells", () => {
    // Two cells at h=20 (indices 3 and 4).
    const result = findCellsByHeightRangeInPack(
      asPack(makePack()),
      20,
      20,
      DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4], count: 2 });
  });

  it("full [0, 100] range collects every cell", () => {
    const result = findCellsByHeightRangeInPack(
      asPack(makePack()),
      0,
      100,
      DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
    );
    expect(result).toEqual({
      cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      count: 10,
    });
  });

  it("returns empty cells and count=0 when no cell matches", () => {
    // No cell sits in h=30..35 in our fixture.
    const result = findCellsByHeightRangeInPack(
      asPack(makePack()),
      30,
      35,
      DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [], count: 0 });
  });

  it("truncates `cells` at limit but preserves full `count`", () => {
    const result = findCellsByHeightRangeInPack(asPack(makePack()), 0, 100, 3);
    expect(result).toEqual({ cells: [0, 1, 2], count: 10 });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findCellsByHeightRangeInPack(
        undefined,
        0,
        100,
        DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findCellsByHeightRangeInPack
    >[0];
    expect(
      findCellsByHeightRangeInPack(
        pack,
        0,
        100,
        DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.h is missing", () => {
    const pack = { cells: {} } as unknown as Parameters<
      typeof findCellsByHeightRangeInPack
    >[0];
    expect(
      findCellsByHeightRangeInPack(
        pack,
        0,
        100,
        DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_cells_by_height_range — tool surface", () => {
  it("returns ok=true with the resolved cells and count", async () => {
    const tool = createFindCellsByHeightRangeTool(realRuntime());
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
    const tool = createFindCellsByHeightRangeTool(realRuntime());
    const result = await tool.execute({ min: 0, max: 100, limit: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cells).toHaveLength(3);
    expect(body.count).toBe(10);
  });

  it("rejects missing / invalid min", async () => {
    const tool = createFindCellsByHeightRangeTool(realRuntime());
    for (const bad of [
      { max: 50 },
      { min: -1, max: 50 },
      { min: 101, max: 50 },
      { min: 1.5, max: 50 },
      { min: "20", max: 50 },
      { min: null, max: 50 },
      { min: true, max: 50 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /min must be an integer in \[0, 100\]/,
      );
    }
  });

  it("rejects missing / invalid max", async () => {
    const tool = createFindCellsByHeightRangeTool(realRuntime());
    for (const bad of [
      { min: 0 },
      { min: 0, max: -1 },
      { min: 0, max: 101 },
      { min: 0, max: 1.5 },
      { min: 0, max: "50" },
      { min: 0, max: null },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /max must be an integer in \[0, 100\]/,
      );
    }
  });

  it("rejects min > max", async () => {
    const tool = createFindCellsByHeightRangeTool(realRuntime());
    const r = await tool.execute({ min: 80, max: 20 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/min must be <= max/);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindCellsByHeightRangeTool(realRuntime());
    for (const bad of [
      { min: 0, max: 100, limit: 0 },
      { min: 0, max: 100, limit: -1 },
      { min: 0, max: 100, limit: 1.5 },
      { min: 0, max: 100, limit: "10" },
      { min: 0, max: 100, limit: MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindCellsByHeightRangeTool(
      runtimeReturning("not-ready"),
    );
    const r = await tool.execute({ min: 0, max: 100 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindCellsByHeightRangeRuntime = {
      find: (_min, _max, limit) => {
        received = limit;
        return { cells: [], count: 0 };
      },
    };
    const tool = createFindCellsByHeightRangeTool(runtime);
    await tool.execute({ min: 0, max: 100 });
    expect(received).toBe(DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT);
  });

  it("is exported as findCellsByHeightRangeTool with the expected schema", () => {
    expect(findCellsByHeightRangeTool.name).toBe("find_cells_by_height_range");
    expect(findCellsByHeightRangeTool.input_schema.type).toBe("object");
    expect(findCellsByHeightRangeTool.input_schema.required).toEqual([
      "min",
      "max",
    ]);
    expect(
      findCellsByHeightRangeTool.input_schema.properties.min,
    ).toBeDefined();
    expect(
      findCellsByHeightRangeTool.input_schema.properties.max,
    ).toBeDefined();
    expect(
      findCellsByHeightRangeTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit and MIN_HEIGHT / MAX_HEIGHT constants", () => {
    expect(DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT).toBe(10000);
    expect(MAX_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT).toBe(100000);
    expect(MIN_HEIGHT).toBe(0);
    expect(MAX_HEIGHT).toBe(100);
  });
});

// ----- defaultFindCellsByHeightRangeRuntime integration -----

describe("defaultFindCellsByHeightRangeRuntime (integration)", () => {
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
    const result = defaultFindCellsByHeightRangeRuntime.find(
      20,
      40,
      DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
    );
    expect(result).toEqual({ cells: [3, 4, 5, 6], count: 4 });
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findCellsByHeightRangeTool.execute({
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
      defaultFindCellsByHeightRangeRuntime.find(
        0,
        100,
        DEFAULT_FIND_CELLS_BY_HEIGHT_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findCellsByHeightRangeTool.execute({
      min: 0,
      max: 100,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
