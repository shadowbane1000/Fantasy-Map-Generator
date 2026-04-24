import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CultureDistribution,
  type CultureDistributionPackLike,
  type CultureDistributionRuntime,
  createGetCultureDistributionTool,
  defaultCultureDistributionRuntime,
  getCultureDistributionTool,
  readCultureDistributionFromPack,
} from "./get-culture-distribution";

interface FakeCulture {
  i: number;
  name?: string;
  type?: string;
  color?: string;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  removed?: boolean;
}

interface FakePack {
  cultures: Array<FakeCulture | undefined>;
}

function makePack(): FakePack {
  // Cultures:
  //   0: Wildlands (real culture — NOT skipped)   cells=5   area=10   rural=0  urban=0
  //   1: Highlanders  cells=20  area=100  rural=50   urban=30
  //   2: Seafarers    cells=30  area=80   rural=10   urban=5
  //   3: Gone         removed
  //   4: Riverfolk    cells=50  area=60   rural=100  urban=100
  //   5: Shadowkin    cells=0   area=0    (missing numeric fields)
  return {
    cultures: [
      {
        i: 0,
        name: "Wildlands",
        cells: 5,
        area: 10,
        rural: 0,
        urban: 0,
      },
      {
        i: 1,
        name: "Highlanders",
        type: "Highland",
        color: "#ff0000",
        cells: 20,
        area: 100,
        rural: 50,
        urban: 30,
      },
      {
        i: 2,
        name: "Seafarers",
        type: "Naval",
        color: "#00ff00",
        cells: 30,
        area: 80,
        rural: 10,
        urban: 5,
      },
      {
        i: 3,
        name: "Gone",
        removed: true,
        cells: 9999,
        area: 9999,
        rural: 9999,
        urban: 9999,
      },
      {
        i: 4,
        name: "Riverfolk",
        type: "River",
        color: "#0000ff",
        cells: 50,
        area: 60,
        rural: 100,
        urban: 100,
      },
      { i: 5, name: "Shadowkin" },
    ],
  };
}

function asPack(p: FakePack): CultureDistributionPackLike {
  return p as unknown as CultureDistributionPackLike;
}

function runtimeReturning(
  result: CultureDistribution | "not-ready",
): CultureDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(populationRate = 1): CultureDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () =>
      readCultureDistributionFromPack(pack, populationRate),
  };
}

describe("get_culture_distribution — pure aggregator", () => {
  it("includes culture 0 (Wildlands) and skips removed cultures", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      1,
    ) as CultureDistribution;
    const ids = result.cultures.map((c) => c.i);
    expect(ids).toContain(0); // Wildlands IS included
    expect(ids).not.toContain(3); // removed
    expect(ids).toEqual(expect.arrayContaining([0, 1, 2, 4, 5]));
  });

  it("sorts cultures by cells_count descending", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      1,
    ) as CultureDistribution;
    // Active cells: 4(50), 2(30), 1(20), 0(5), 5(0)
    expect(result.cultures.map((c) => c.i)).toEqual([4, 2, 1, 0, 5]);
  });

  it("computes total_cells as sum of active culture.cells (incl. Wildlands)", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      1,
    ) as CultureDistribution;
    // 5 + 20 + 30 + 50 + 0 = 105
    expect(result.total_cells).toBe(105);
  });

  it("computes total_population as sum of scaled rural+urban", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      10,
    ) as CultureDistribution;
    // rate=10; population: 0→0; 1→(50+30)*10=800; 2→(10+5)*10=150;
    //   4→(100+100)*10=2000; 5→0
    // total = 0 + 800 + 150 + 2000 + 0 = 2950
    expect(result.total_population).toBe(2950);
  });

  it("computes percentage as cells_count / total_cells * 100", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      1,
    ) as CultureDistribution;
    // total=105; 4≈47.619%, 2≈28.571%, 1≈19.048%, 0≈4.762%, 5=0%
    const byId = new Map(result.cultures.map((c) => [c.i, c.percentage]));
    expect(byId.get(4)).toBeCloseTo((50 / 105) * 100);
    expect(byId.get(2)).toBeCloseTo((30 / 105) * 100);
    expect(byId.get(1)).toBeCloseTo((20 / 105) * 100);
    expect(byId.get(0)).toBeCloseTo((5 / 105) * 100);
    expect(byId.get(5)).toBeCloseTo(0);
  });

  it("scales population by populationRate", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      1000,
    ) as CultureDistribution;
    const byId = new Map(result.cultures.map((c) => [c.i, c.population]));
    expect(byId.get(0)).toBe(0);
    expect(byId.get(1)).toBe(80 * 1000);
    expect(byId.get(2)).toBe(15 * 1000);
    expect(byId.get(4)).toBe(200 * 1000);
    expect(byId.get(5)).toBe(0);
  });

  it("falls back to raw rural+urban when rate is 0 / NaN / negative", () => {
    for (const bad of [0, Number.NaN, -5]) {
      const result = readCultureDistributionFromPack(
        asPack(makePack()),
        bad,
      ) as CultureDistribution;
      const byId = new Map(result.cultures.map((c) => [c.i, c.population]));
      expect(byId.get(1)).toBe(80);
      expect(byId.get(2)).toBe(15);
      expect(byId.get(4)).toBe(200);
    }
  });

  it("maps missing optional fields to null", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      1,
    ) as CultureDistribution;
    const shadow = result.cultures.find((c) => c.i === 5);
    expect(shadow).toMatchObject({
      i: 5,
      name: "Shadowkin",
      color: null,
      type: null,
    });
    // Wildlands also lacks type / color
    const wildlands = result.cultures.find((c) => c.i === 0);
    expect(wildlands?.color).toBeNull();
    expect(wildlands?.type).toBeNull();
  });

  it("treats missing numeric fields as 0", () => {
    const result = readCultureDistributionFromPack(
      asPack(makePack()),
      1,
    ) as CultureDistribution;
    const shadow = result.cultures.find((c) => c.i === 5);
    expect(shadow?.cells_count).toBe(0);
    expect(shadow?.area).toBe(0);
    expect(shadow?.population).toBe(0);
  });

  it("sets percentage to 0 when total_cells is 0", () => {
    const pack = {
      cultures: [
        { i: 0, name: "Wildlands", cells: 0 },
        { i: 1, name: "A", cells: 0, rural: 5 },
        { i: 2, name: "B", cells: 0, rural: 10 },
      ],
    } as unknown as CultureDistributionPackLike;
    const result = readCultureDistributionFromPack(
      pack,
      1,
    ) as CultureDistribution;
    expect(result.total_cells).toBe(0);
    for (const c of result.cultures) {
      expect(c.percentage).toBe(0);
    }
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readCultureDistributionFromPack(undefined, 1)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cultures is missing", () => {
    const pack = {} as CultureDistributionPackLike;
    expect(readCultureDistributionFromPack(pack, 1)).toBe("not-ready");
  });

  it("empty cultures list yields zero totals and empty array", () => {
    const pack = {
      cultures: [],
    } as unknown as CultureDistributionPackLike;
    const result = readCultureDistributionFromPack(
      pack,
      1,
    ) as CultureDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.total_population).toBe(0);
    expect(result.cultures).toEqual([]);
  });

  it("pack with only removed cultures yields empty result", () => {
    const pack = {
      cultures: [
        { i: 0, name: "Wildlands", removed: true, cells: 5 },
        { i: 1, name: "Gone", removed: true, cells: 100 },
      ],
    } as unknown as CultureDistributionPackLike;
    const result = readCultureDistributionFromPack(
      pack,
      1,
    ) as CultureDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.cultures).toEqual([]);
  });

  it("skips falsy slots (undefined / null)", () => {
    const pack = {
      cultures: [
        { i: 0, name: "Wildlands", cells: 1 },
        undefined,
        { i: 2, name: "Real", cells: 5, rural: 10 },
      ],
    } as unknown as CultureDistributionPackLike;
    const result = readCultureDistributionFromPack(
      pack,
      1,
    ) as CultureDistribution;
    expect(result.cultures).toHaveLength(2);
    expect(result.cultures.map((c) => c.i)).toEqual([2, 0]);
  });
});

describe("get_culture_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetCultureDistributionTool(realRuntime(1));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(105);
    expect(Array.isArray(body.cultures)).toBe(true);
    expect(body.cultures).toHaveLength(5);
    expect(body.cultures.map((c: { i: number }) => c.i)).toEqual([
      4, 2, 1, 0, 5,
    ]);
  });

  it("returns integer-rounded population scaled by populationRate", async () => {
    const tool = createGetCultureDistributionTool(realRuntime(1000));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    const byId = new Map<number, number>(
      body.cultures.map((c: { i: number; population: number }) => [
        c.i,
        c.population,
      ]),
    );
    expect(byId.get(1)).toBe(80000);
    expect(byId.get(4)).toBe(200000);
    expect(body.total_population).toBe(295000);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetCultureDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetCultureDistributionTool(
      runtimeReturning("not-ready"),
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getCultureDistributionTool with the expected schema", () => {
    expect(getCultureDistributionTool.name).toBe("get_culture_distribution");
    expect(getCultureDistributionTool.input_schema.type).toBe("object");
    expect(getCultureDistributionTool.input_schema.required).toBeUndefined();
    expect(getCultureDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultCultureDistributionRuntime integration -----

describe("defaultCultureDistributionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    populationRate?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalRate = globalsRef.populationRate;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.populationRate = 1000;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.populationRate = originalRate;
  });

  it("reads real distribution through the default runtime", () => {
    const result =
      defaultCultureDistributionRuntime.readDistribution() as CultureDistribution;
    expect(result.total_cells).toBe(105);
    expect(result.cultures.map((c) => c.i)).toEqual([4, 2, 1, 0, 5]);
    // Riverfolk population: 200 * 1000 = 200000
    expect(result.cultures[0].population).toBe(200000);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getCultureDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(105);
    expect(body.total_population).toBe(295000);
    expect(body.cultures[0].i).toBe(4);
    expect(body.cultures[0].name).toBe("Riverfolk");
    expect(body.cultures[0].percentage).toBeCloseTo((50 / 105) * 100);
  });

  it("falls back to rate=1 when populationRate global is missing", () => {
    globalsRef.populationRate = undefined;
    const result =
      defaultCultureDistributionRuntime.readDistribution() as CultureDistribution;
    // Riverfolk: rural+urban = 200 * 1 = 200
    const riverfolk = result.cultures.find((c) => c.i === 4);
    expect(riverfolk?.population).toBe(200);
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultCultureDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getCultureDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
