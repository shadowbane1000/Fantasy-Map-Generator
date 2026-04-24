import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetTerrainStatsTool,
  defaultTerrainStatsRuntime,
  getTerrainStatsTool,
  readTerrainStatsFromPack,
  TERRAIN_BAND_RANGES,
  type TerrainStats,
  type TerrainStatsRuntime,
} from "./get-terrain-stats";

interface FakePack {
  cells?: {
    h?: number[];
    t?: number[];
  };
}

function runtimeReturning(
  result: TerrainStats | "not-ready",
): TerrainStatsRuntime {
  return { readStats: () => result };
}

describe("get_terrain_stats tool — pure / seam", () => {
  it("returns 'not-ready' when pack is missing", () => {
    expect(readTerrainStatsFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    expect(readTerrainStatsFromPack({} as never)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.h is missing", () => {
    expect(readTerrainStatsFromPack({ cells: {} } as never)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.h has no numeric length", () => {
    expect(readTerrainStatsFromPack({ cells: { h: {} } } as never)).toBe(
      "not-ready",
    );
  });

  it("handles empty cells.h — all zero stats, still returns an object", () => {
    const pack: FakePack = { cells: { h: [] } };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    expect(stats).not.toBe("not-ready");
    expect(stats.total_cells).toBe(0);
    expect(stats.land_cells).toBe(0);
    expect(stats.water_cells).toBe(0);
    expect(stats.land_pct).toBe(0);
    expect(stats.water_pct).toBe(0);
    expect(stats.coastal_cells).toBe(0);
    expect(stats.peaks).toBe(0);
    expect(stats.height_min).toBe(0);
    expect(stats.height_max).toBe(0);
    expect(stats.height_mean).toBe(0);
    for (const band of TERRAIN_BAND_RANGES) {
      expect(stats.bands[band.name]).toEqual({ count: 0, percentage: 0 });
    }
  });

  it("computes correct land / water / peak counts and percentages", () => {
    // 10 cells: water=4 (h<20), land=6 (h>=20), peaks=2 (h>=80).
    const pack: FakePack = {
      cells: { h: [0, 5, 10, 19, 20, 30, 50, 70, 85, 100] },
    };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    expect(stats.total_cells).toBe(10);
    expect(stats.land_cells).toBe(6);
    expect(stats.water_cells).toBe(4);
    expect(stats.peaks).toBe(2);
    expect(stats.land_pct).toBe(60);
    expect(stats.water_pct).toBe(40);
  });

  it("computes correct min / max / mean height", () => {
    const pack: FakePack = { cells: { h: [10, 20, 30, 40, 50] } };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    expect(stats.height_min).toBe(10);
    expect(stats.height_max).toBe(50);
    expect(stats.height_mean).toBe(30);
  });

  it("rounds height_mean to 2 decimals", () => {
    // mean = 100/3 = 33.333… → 33.33
    const pack: FakePack = { cells: { h: [30, 33, 37] } };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    expect(stats.height_mean).toBe(33.33);
  });

  it("places cells at every band boundary in the correct bucket", () => {
    const cases: Array<{ h: number; band: string }> = [
      { h: 0, band: "deep_water" },
      { h: 4, band: "deep_water" },
      { h: 5, band: "shallow_water" },
      { h: 19, band: "shallow_water" },
      { h: 20, band: "coast" },
      { h: 25, band: "coast" },
      { h: 26, band: "lowlands" },
      { h: 39, band: "lowlands" },
      { h: 40, band: "hills" },
      { h: 59, band: "hills" },
      { h: 60, band: "mountains" },
      { h: 79, band: "mountains" },
      { h: 80, band: "peaks" },
      { h: 100, band: "peaks" },
    ];
    for (const { h, band } of cases) {
      const pack: FakePack = { cells: { h: [h] } };
      const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
      for (const b of TERRAIN_BAND_RANGES) {
        if (b.name === band) {
          expect(stats.bands[b.name].count).toBe(1);
          expect(stats.bands[b.name].percentage).toBe(100);
        } else {
          expect(stats.bands[b.name].count).toBe(0);
          expect(stats.bands[b.name].percentage).toBe(0);
        }
      }
    }
  });

  it("band percentages sum to ~100 when total_cells > 0", () => {
    const pack: FakePack = {
      cells: { h: [0, 5, 10, 20, 30, 40, 50, 60, 70, 85] },
    };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    const sum = TERRAIN_BAND_RANGES.reduce(
      (acc, b) => acc + stats.bands[b.name].percentage,
      0,
    );
    expect(Math.round(sum)).toBe(100);
  });

  it("counts coastal cells from cells.t (t === 1 or t === -1 only)", () => {
    // Mixed t values: 1=LAND_COAST, -1=WATER_COAST, 2/−2 are NOT coast.
    const pack: FakePack = {
      cells: {
        h: [20, 20, 20, 20, 20, 20],
        t: [1, -1, 1, 2, -2, 0],
      },
    };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    expect(stats.coastal_cells).toBe(3);
  });

  it("reports coastal_cells = 0 when cells.t is missing (does NOT return not-ready)", () => {
    const pack: FakePack = { cells: { h: [20, 30, 40] } };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    expect(stats).not.toBe("not-ready");
    expect(stats.coastal_cells).toBe(0);
    expect(stats.total_cells).toBe(3);
  });

  it("skips non-finite height values when computing stats", () => {
    const pack: FakePack = {
      cells: {
        h: [10, 20, Number.NaN as unknown as number, 50, 80],
      },
    };
    const stats = readTerrainStatsFromPack(pack as never) as TerrainStats;
    // total_cells stays as h.length (includes the NaN slot), but counts
    // only include finite values.
    expect(stats.total_cells).toBe(5);
    expect(stats.land_cells).toBe(3);
    expect(stats.water_cells).toBe(1);
    expect(stats.peaks).toBe(1);
    expect(stats.height_min).toBe(10);
    expect(stats.height_max).toBe(80);
  });
});

describe("get_terrain_stats tool — surface", () => {
  it("returns a valid JSON payload with the expected fields", async () => {
    const pack: FakePack = {
      cells: {
        h: [0, 5, 20, 40, 80],
        t: [-2, -1, 1, 2, 3],
      },
    };
    const tool = createGetTerrainStatsTool({
      readStats: () => readTerrainStatsFromPack(pack as never),
    });
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(5);
    expect(body.land_cells).toBe(3);
    expect(body.water_cells).toBe(2);
    expect(body.coastal_cells).toBe(2);
    expect(body.peaks).toBe(1);
    expect(body.height_min).toBe(0);
    expect(body.height_max).toBe(80);
    expect(typeof body.height_mean).toBe("number");
    expect(body.bands).toBeDefined();
    expect(body.bands.deep_water).toEqual({ count: 1, percentage: 20 });
    expect(body.bands.peaks).toEqual({ count: 1, percentage: 20 });
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetTerrainStatsTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("ignores unrelated input keys", async () => {
    const pack: FakePack = { cells: { h: [20, 40, 80] } };
    const tool = createGetTerrainStatsTool({
      readStats: () => readTerrainStatsFromPack(pack as never),
    });
    const result = await tool.execute({
      unused: true,
      something: "else",
      limit: 5,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total_cells).toBe(3);
  });

  it("is exported as getTerrainStatsTool with the expected schema", () => {
    expect(getTerrainStatsTool.name).toBe("get_terrain_stats");
    expect(getTerrainStatsTool.input_schema.type).toBe("object");
    expect(getTerrainStatsTool.input_schema.required).toBeUndefined();
  });

  it("exports TERRAIN_BAND_RANGES with 7 bands covering [0, 100] contiguously", () => {
    expect(TERRAIN_BAND_RANGES).toHaveLength(7);
    expect(TERRAIN_BAND_RANGES[0].min).toBe(0);
    expect(TERRAIN_BAND_RANGES[TERRAIN_BAND_RANGES.length - 1].max).toBe(100);
    for (let i = 1; i < TERRAIN_BAND_RANGES.length; i++) {
      expect(TERRAIN_BAND_RANGES[i].min).toBe(
        TERRAIN_BAND_RANGES[i - 1].max + 1,
      );
    }
  });
});

// ----- defaultTerrainStatsRuntime integration -----

describe("defaultTerrainStatsRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
  };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = {
      cells: {
        h: [0, 10, 20, 40, 60, 85, 100],
        t: [-2, -1, 1, 2, 0, 0, 0],
      },
    } as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real aggregate stats through the default runtime", () => {
    const stats = defaultTerrainStatsRuntime.readStats();
    expect(stats).not.toBe("not-ready");
    const s = stats as TerrainStats;
    expect(s.total_cells).toBe(7);
    expect(s.land_cells).toBe(5); // 20,40,60,85,100
    expect(s.water_cells).toBe(2); // 0,10
    expect(s.peaks).toBe(2); // 85,100
    expect(s.coastal_cells).toBe(2); // -1, 1
    expect(s.height_min).toBe(0);
    expect(s.height_max).toBe(100);
    expect(s.bands.deep_water.count).toBe(1);
    expect(s.bands.shallow_water.count).toBe(1);
    expect(s.bands.coast.count).toBe(1);
    expect(s.bands.hills.count).toBe(1);
    expect(s.bands.mountains.count).toBe(1);
    expect(s.bands.peaks.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing and the tool surfaces it", async () => {
    globalsRef.pack = undefined;
    expect(defaultTerrainStatsRuntime.readStats()).toBe("not-ready");
    const result = await getTerrainStatsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
