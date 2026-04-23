import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindBurgsByPopulationRangeTool,
  DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
  defaultFindBurgsByPopulationRangeRuntime,
  type FindBurgsByPopulationRangeResult,
  type FindBurgsByPopulationRangeRuntime,
  findBurgsByPopulationRangeInPack,
  findBurgsByPopulationRangeTool,
  MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
  MIN_POPULATION,
} from "./find-burgs-by-population-range";

interface FakePack {
  burgs: Array<{
    i: number;
    name?: string;
    x?: number;
    y?: number;
    population?: number;
    capital?: number;
    removed?: boolean;
  }>;
}

function makePack(): FakePack {
  // Burgs (active unless noted):
  //   0: placeholder
  //   1: Astral     pop = 0      capital
  //   2: Birchwell  pop = 0.5
  //   3: Coldreach  pop = 1.25
  //   4: Dusktown   pop = 3.8
  //   5: Emberkeep  pop = 8.2    capital
  //   6: Freehold   pop = 20
  //   7: Ghostholm  pop = 42.6   removed — should be skipped
  //   8: Orphan     no pop field — should be skipped
  return {
    burgs: [
      { i: 0 },
      { i: 1, name: "Astral", x: 100, y: 200, population: 0, capital: 1 },
      { i: 2, name: "Birchwell", x: 110, y: 210, population: 0.5, capital: 0 },
      { i: 3, name: "Coldreach", x: 120, y: 220, population: 1.25, capital: 0 },
      { i: 4, name: "Dusktown", x: 130, y: 230, population: 3.8, capital: 0 },
      { i: 5, name: "Emberkeep", x: 140, y: 240, population: 8.2, capital: 1 },
      { i: 6, name: "Freehold", x: 150, y: 250, population: 20, capital: 0 },
      {
        i: 7,
        name: "Ghostholm",
        x: 0,
        y: 0,
        population: 42.6,
        capital: 0,
        removed: true,
      },
      { i: 8, name: "Orphan", x: 160, y: 260 },
    ],
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findBurgsByPopulationRangeInPack>[0];
}

function runtimeReturning(
  result: FindBurgsByPopulationRangeResult,
): FindBurgsByPopulationRangeRuntime {
  return { find: () => result };
}

function realRuntime(): FindBurgsByPopulationRangeRuntime {
  const pack = asPack(makePack());
  return {
    find: (min, max, limit) =>
      findBurgsByPopulationRangeInPack(pack, min, max, limit),
  };
}

describe("find_burgs_by_population_range — pure collector", () => {
  it("collects burgs inside a mid-range band", () => {
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      1,
      10,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    // Active burgs with pop in [1, 10]: 3 (1.25), 4 (3.8), 5 (8.2)
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([3, 4, 5]));
    expect(result.count).toBe(3);
  });

  it("includes both boundary values (inclusive range)", () => {
    // min=0.5 matches burg 2 (pop=0.5); max=20 matches burg 6 (pop=20).
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      0.5,
      20,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(
      new Set([2, 3, 4, 5, 6]),
    );
    expect(result.count).toBe(5);
  });

  it("single-value range returns exactly those burgs", () => {
    // Only burg 1 has pop=0 (burg 7 has pop=0 worth but is removed).
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      0,
      0,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(result.burgs.map((b) => b.i)).toEqual([1]);
    expect(result.count).toBe(1);
  });

  it("wide range collects every active numeric-pop burg", () => {
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      0,
      Number.POSITIVE_INFINITY,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(
      new Set([1, 2, 3, 4, 5, 6]),
    );
    expect(result.count).toBe(6);
  });

  it("returns empty burgs and count=0 when no burg matches", () => {
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      200,
      300,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as { burgs: unknown[]; count: number };
    expect(result.burgs).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("truncates `burgs` at limit but preserves full `count`", () => {
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      0,
      Number.POSITIVE_INFINITY,
      2,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(result.burgs.length).toBe(2);
    expect(result.count).toBe(6);
  });

  it("skips i=0 placeholder, removed burgs, and non-number population", () => {
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      0,
      1e9,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    const ids = new Set(result.burgs.map((b) => b.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(7)).toBe(false); // removed
    expect(ids.has(8)).toBe(false); // no numeric population
  });

  it("populates x, y, name, population, capital from the raw burg", () => {
    const result = findBurgsByPopulationRangeInPack(
      asPack(makePack()),
      8.2,
      8.2,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as {
      burgs: Array<{
        i: number;
        name: string;
        x: number;
        y: number;
        population: number;
        capital: boolean;
      }>;
    };
    expect(result.burgs).toEqual([
      {
        i: 5,
        name: "Emberkeep",
        x: 140,
        y: 240,
        population: 8.2,
        capital: true,
      },
    ]);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      findBurgsByPopulationRangeInPack(
        undefined,
        0,
        1e9,
        DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findBurgsByPopulationRangeInPack
    >[0];
    expect(
      findBurgsByPopulationRangeInPack(
        pack,
        0,
        1e9,
        DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
  });
});

describe("find_burgs_by_population_range — tool surface", () => {
  it("returns ok=true with the resolved burgs and count", async () => {
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    const result = await tool.execute({ min: 1, max: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.min).toBe(1);
    expect(body.max).toBe(10);
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([3, 4, 5]),
    );
    expect(body.count).toBe(3);
  });

  it("accepts fractional min and max", async () => {
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    const result = await tool.execute({ min: 0.5, max: 3.8 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(new Set(body.burgs.map((b: { i: number }) => b.i))).toEqual(
      new Set([2, 3, 4]),
    );
    expect(body.count).toBe(3);
  });

  it("defaults min to 0 when only max is supplied", async () => {
    let receivedMin = -999;
    const runtime: FindBurgsByPopulationRangeRuntime = {
      find: (min, _max, _limit) => {
        receivedMin = min;
        return { burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByPopulationRangeTool(runtime);
    const result = await tool.execute({ max: 10 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(receivedMin).toBe(0);
    expect(body.min).toBe(0);
    expect(body.max).toBe(10);
  });

  it("defaults max to Infinity when only min is supplied", async () => {
    let receivedMax = -999;
    const runtime: FindBurgsByPopulationRangeRuntime = {
      find: (_min, max, _limit) => {
        receivedMax = max;
        return { burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByPopulationRangeTool(runtime);
    const result = await tool.execute({ min: 5 });
    expect(result.isError).toBeFalsy();
    expect(receivedMax).toBe(Number.POSITIVE_INFINITY);
  });

  it("respects limit and still reports full count", async () => {
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    const result = await tool.execute({ min: 0, max: 1e9, limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burgs).toHaveLength(2);
    expect(body.count).toBe(6);
  });

  it("rejects both min and max missing", async () => {
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    for (const bad of [{}, { min: null, max: null }, { min: undefined }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /at least one of min or max/i,
      );
    }
  });

  it("rejects invalid min", async () => {
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    for (const bad of [
      { min: -1, max: 50 },
      { min: -0.1, max: 50 },
      { min: "20", max: 50 },
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

  it("rejects invalid max (including explicit Infinity)", async () => {
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    for (const bad of [
      { min: 0, max: -1 },
      { min: 0, max: -0.5 },
      { min: 0, max: "50" },
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
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    const r = await tool.execute({ min: 80, max: 20 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/min must be <= max/);
  });

  it("rejects invalid limit", async () => {
    const tool = createFindBurgsByPopulationRangeTool(realRuntime());
    for (const bad of [
      { min: 0, max: 100, limit: 0 },
      { min: 0, max: 100, limit: -1 },
      { min: 0, max: 100, limit: 1.5 },
      { min: 0, max: 100, limit: "10" },
      { min: 0, max: 100, limit: MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT + 1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindBurgsByPopulationRangeTool(
      runtimeReturning("not-ready"),
    );
    const r = await tool.execute({ min: 0, max: 100 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("applies default limit when omitted", async () => {
    let received = -1;
    const runtime: FindBurgsByPopulationRangeRuntime = {
      find: (_min, _max, limit) => {
        received = limit;
        return { burgs: [], count: 0 };
      },
    };
    const tool = createFindBurgsByPopulationRangeTool(runtime);
    await tool.execute({ min: 0, max: 100 });
    expect(received).toBe(DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT);
  });

  it("is exported as findBurgsByPopulationRangeTool with the expected schema", () => {
    expect(findBurgsByPopulationRangeTool.name).toBe(
      "find_burgs_by_population_range",
    );
    expect(findBurgsByPopulationRangeTool.input_schema.type).toBe("object");
    expect(
      findBurgsByPopulationRangeTool.input_schema.properties.min,
    ).toBeDefined();
    expect(
      findBurgsByPopulationRangeTool.input_schema.properties.max,
    ).toBeDefined();
    expect(
      findBurgsByPopulationRangeTool.input_schema.properties.limit,
    ).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit and MIN_POPULATION constants", () => {
    expect(DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT).toBe(10000);
    expect(MAX_FIND_BURGS_BY_POPULATION_RANGE_LIMIT).toBe(100000);
    expect(MIN_POPULATION).toBe(0);
  });
});

// ----- defaultFindBurgsByPopulationRangeRuntime integration -----

describe("defaultFindBurgsByPopulationRangeRuntime (integration)", () => {
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
    const result = defaultFindBurgsByPopulationRangeRuntime.find(
      1,
      10,
      DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
    ) as { burgs: Array<{ i: number }>; count: number };
    expect(new Set(result.burgs.map((b) => b.i))).toEqual(new Set([3, 4, 5]));
    expect(result.count).toBe(3);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findBurgsByPopulationRangeTool.execute({
      min: 0,
      max: 0,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.min).toBe(0);
    expect(body.max).toBe(0);
    expect(body.burgs.map((b: { i: number }) => b.i)).toEqual([1]);
    expect(body.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindBurgsByPopulationRangeRuntime.find(
        0,
        1e9,
        DEFAULT_FIND_BURGS_BY_POPULATION_RANGE_LIMIT,
      ),
    ).toBe("not-ready");
    const result = await findBurgsByPopulationRangeTool.execute({
      min: 0,
      max: 1e9,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
