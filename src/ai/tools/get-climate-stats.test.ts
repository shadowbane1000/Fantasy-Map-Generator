import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ClimateStats,
  type ClimateStatsGridLike,
  type ClimateStatsRuntime,
  createGetClimateStatsTool,
  defaultClimateStatsRuntime,
  getClimateStatsTool,
  readClimateStatsFromGrid,
} from "./get-climate-stats";

interface FakeGrid {
  cells: {
    temp: number[];
    prec: number[];
  };
}

function makeGrid(): FakeGrid {
  // 10 grid cells — spread of temperatures (°C) and precipitation.
  return {
    cells: {
      temp: [-30, -20, -5, 0, 10, 15, 20, 25, 35, 45],
      prec: [0, 5, 18, 20, 20, 25, 40, 60, 80, 250],
    },
  };
}

function asGrid(g: FakeGrid): ClimateStatsGridLike {
  return g as unknown as ClimateStatsGridLike;
}

function runtimeReturning(
  result: ClimateStats | "not-ready",
): ClimateStatsRuntime {
  return { readStats: () => result };
}

describe("get_climate_stats — pure aggregator", () => {
  it("computes correct min / max / mean for temperature and precipitation", () => {
    const stats = readClimateStatsFromGrid(asGrid(makeGrid())) as ClimateStats;
    // temp: sum = -30+-20+-5+0+10+15+20+25+35+45 = 95; mean = 9.5
    expect(stats.temperature.min).toBe(-30);
    expect(stats.temperature.max).toBe(45);
    expect(stats.temperature.mean).toBeCloseTo(9.5, 10);

    // prec: sum = 0+5+18+20+20+25+40+60+80+250 = 518; mean = 51.8
    expect(stats.precipitation.min).toBe(0);
    expect(stats.precipitation.max).toBe(250);
    expect(stats.precipitation.mean).toBeCloseTo(51.8, 10);

    expect(stats.grid_cells).toBe(10);
  });

  it("handles single-element arrays", () => {
    const grid: FakeGrid = { cells: { temp: [7], prec: [42] } };
    const stats = readClimateStatsFromGrid(asGrid(grid)) as ClimateStats;
    expect(stats.temperature).toEqual({ min: 7, max: 7, mean: 7 });
    expect(stats.precipitation).toEqual({ min: 42, max: 42, mean: 42 });
    expect(stats.grid_cells).toBe(1);
  });

  it("supports negative temperatures cleanly", () => {
    const grid: FakeGrid = {
      cells: { temp: [-40, -30, -20], prec: [0, 0, 0] },
    };
    const stats = readClimateStatsFromGrid(asGrid(grid)) as ClimateStats;
    expect(stats.temperature.min).toBe(-40);
    expect(stats.temperature.max).toBe(-20);
    expect(stats.temperature.mean).toBeCloseTo(-30, 10);
  });

  it("skips non-finite / non-numeric entries per-array without poisoning the other", () => {
    const grid: FakeGrid = {
      cells: {
        // Valid: 10, 20, 30  -> min=10, max=30, mean=20
        temp: [
          10,
          Number.NaN as unknown as number,
          20,
          Number.POSITIVE_INFINITY as unknown as number,
          "x" as unknown as number,
          30,
        ],
        // Valid: 5, 15, 25, 35 -> min=5, max=35, mean=20
        prec: [
          5,
          15,
          25,
          35,
          Number.NaN as unknown as number,
          undefined as unknown as number,
        ],
      },
    };
    const stats = readClimateStatsFromGrid(asGrid(grid)) as ClimateStats;
    expect(stats.temperature).toEqual({ min: 10, max: 30, mean: 20 });
    expect(stats.precipitation).toEqual({ min: 5, max: 35, mean: 20 });
    // grid_cells uses the raw array length, unchanged by skipping.
    expect(stats.grid_cells).toBe(6);
  });

  it("empty / all-invalid arrays produce zero stats", () => {
    const empty: FakeGrid = { cells: { temp: [], prec: [] } };
    const stats = readClimateStatsFromGrid(asGrid(empty)) as ClimateStats;
    expect(stats.temperature).toEqual({ min: 0, max: 0, mean: 0 });
    expect(stats.precipitation).toEqual({ min: 0, max: 0, mean: 0 });
    expect(stats.grid_cells).toBe(0);

    const allBad: FakeGrid = {
      cells: {
        temp: [
          Number.NaN as unknown as number,
          Number.POSITIVE_INFINITY as unknown as number,
        ],
        prec: ["a" as unknown as number, undefined as unknown as number],
      },
    };
    const stats2 = readClimateStatsFromGrid(asGrid(allBad)) as ClimateStats;
    expect(stats2.temperature).toEqual({ min: 0, max: 0, mean: 0 });
    expect(stats2.precipitation).toEqual({ min: 0, max: 0, mean: 0 });
    expect(stats2.grid_cells).toBe(2);
  });

  it("returns 'not-ready' when grid is missing", () => {
    expect(readClimateStatsFromGrid(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when grid.cells is missing", () => {
    const grid = {} as unknown as ClimateStatsGridLike;
    expect(readClimateStatsFromGrid(grid)).toBe("not-ready");
  });

  it("returns 'not-ready' when grid.cells.temp is missing", () => {
    const grid = {
      cells: { prec: [1, 2, 3] },
    } as unknown as ClimateStatsGridLike;
    expect(readClimateStatsFromGrid(grid)).toBe("not-ready");
  });

  it("returns 'not-ready' when grid.cells.prec is missing", () => {
    const grid = {
      cells: { temp: [1, 2, 3] },
    } as unknown as ClimateStatsGridLike;
    expect(readClimateStatsFromGrid(grid)).toBe("not-ready");
  });
});

describe("get_climate_stats — tool surface", () => {
  it("returns ok=true with the resolved stats", async () => {
    const tool = createGetClimateStatsTool({
      readStats: () => readClimateStatsFromGrid(asGrid(makeGrid())),
    });
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.grid_cells).toBe(10);
    expect(body.temperature.min).toBe(-30);
    expect(body.temperature.max).toBe(45);
    expect(body.temperature.mean).toBeCloseTo(9.5, 10);
    expect(body.precipitation.min).toBe(0);
    expect(body.precipitation.max).toBe(250);
    expect(body.precipitation.mean).toBeCloseTo(51.8, 10);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetClimateStatsTool({
      readStats: () => readClimateStatsFromGrid(asGrid(makeGrid())),
    });
    const result = await tool.execute({ unused: true, something: "else" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetClimateStatsTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getClimateStatsTool with the expected schema", () => {
    expect(getClimateStatsTool.name).toBe("get_climate_stats");
    expect(getClimateStatsTool.input_schema.type).toBe("object");
    expect(getClimateStatsTool.input_schema.required).toBeUndefined();
    expect(getClimateStatsTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultClimateStatsRuntime integration -----

describe("defaultClimateStatsRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    grid?: unknown;
  };
  const originalGrid = globalsRef.grid;

  beforeEach(() => {
    globalsRef.grid = makeGrid() as unknown;
  });

  afterEach(() => {
    globalsRef.grid = originalGrid;
  });

  it("reads real grid via the default runtime (happy path)", () => {
    const stats = defaultClimateStatsRuntime.readStats();
    expect(stats).not.toBe("not-ready");
    const s = stats as ClimateStats;
    expect(s.grid_cells).toBe(10);
    expect(s.temperature.min).toBe(-30);
    expect(s.temperature.max).toBe(45);
    expect(s.temperature.mean).toBeCloseTo(9.5, 10);
    expect(s.precipitation.min).toBe(0);
    expect(s.precipitation.max).toBe(250);
    expect(s.precipitation.mean).toBeCloseTo(51.8, 10);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getClimateStatsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.grid_cells).toBe(10);
  });

  it("returns 'not-ready' when grid is missing → tool surfaces error", async () => {
    globalsRef.grid = undefined;
    expect(defaultClimateStatsRuntime.readStats()).toBe("not-ready");
    const result = await getClimateStatsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
