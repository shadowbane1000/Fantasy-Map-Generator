import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetReligionDistributionTool,
  defaultReligionDistributionRuntime,
  getReligionDistributionTool,
  type ReligionDistribution,
  type ReligionDistributionPackLike,
  type ReligionDistributionRuntime,
  readReligionDistributionFromPack,
} from "./get-religion-distribution";

interface FakeReligion {
  i: number;
  name?: string;
  type?: string;
  form?: string;
  color?: string;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  removed?: boolean;
}

interface FakePack {
  religions: Array<FakeReligion | undefined>;
}

function makePack(): FakePack {
  // Religions:
  //   0: "No religion" placeholder
  //   1: Ashenfaith   cells=20  area=100  rural=50   urban=30
  //   2: Sealight     cells=30  area=80   rural=10   urban=5
  //   3: Gone         removed
  //   4: Brighthymn   cells=50  area=60   rural=100  urban=100
  //   5: Shadowcreed  cells=0   area=0    (missing numeric fields)
  return {
    religions: [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Ashenfaith",
        type: "Organized",
        form: "Monotheism",
        color: "#ff0000",
        cells: 20,
        area: 100,
        rural: 50,
        urban: 30,
      },
      {
        i: 2,
        name: "Sealight",
        type: "Folk",
        form: "Polytheism",
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
        name: "Brighthymn",
        type: "Organized",
        form: "Dualism",
        color: "#0000ff",
        cells: 50,
        area: 60,
        rural: 100,
        urban: 100,
      },
      { i: 5, name: "Shadowcreed" },
    ],
  };
}

function asPack(p: FakePack): ReligionDistributionPackLike {
  return p as unknown as ReligionDistributionPackLike;
}

function runtimeReturning(
  result: ReligionDistribution | "not-ready",
): ReligionDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(populationRate = 1): ReligionDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () =>
      readReligionDistributionFromPack(pack, populationRate),
  };
}

describe("get_religion_distribution — pure aggregator", () => {
  it("skips index-0 placeholder and removed religions", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      1,
    ) as ReligionDistribution;
    const ids = result.religions.map((r) => r.i);
    expect(ids).not.toContain(0);
    expect(ids).not.toContain(3); // removed
    expect(ids).toEqual(expect.arrayContaining([1, 2, 4, 5]));
  });

  it("sorts religions by cells_count descending", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      1,
    ) as ReligionDistribution;
    // Active cells: 4(50), 2(30), 1(20), 5(0)
    expect(result.religions.map((r) => r.i)).toEqual([4, 2, 1, 5]);
  });

  it("computes total_cells as sum of active religion.cells", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      1,
    ) as ReligionDistribution;
    // 20 + 30 + 50 + 0 = 100
    expect(result.total_cells).toBe(100);
  });

  it("computes total_followers as sum of scaled rural+urban", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      10,
    ) as ReligionDistribution;
    // rate=10; followers: 1→(50+30)*10=800; 2→(10+5)*10=150; 4→(100+100)*10=2000; 5→0
    // total = 800 + 150 + 2000 + 0 = 2950
    expect(result.total_followers).toBe(2950);
  });

  it("computes percentage as cells_count / total_cells * 100", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      1,
    ) as ReligionDistribution;
    // total=100; 4=50%, 2=30%, 1=20%, 5=0%
    const byId = new Map(result.religions.map((r) => [r.i, r.percentage]));
    expect(byId.get(4)).toBeCloseTo(50);
    expect(byId.get(2)).toBeCloseTo(30);
    expect(byId.get(1)).toBeCloseTo(20);
    expect(byId.get(5)).toBeCloseTo(0);
  });

  it("scales followers by populationRate", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      1000,
    ) as ReligionDistribution;
    const byId = new Map(result.religions.map((r) => [r.i, r.followers]));
    expect(byId.get(1)).toBe(80 * 1000);
    expect(byId.get(2)).toBe(15 * 1000);
    expect(byId.get(4)).toBe(200 * 1000);
    expect(byId.get(5)).toBe(0);
  });

  it("falls back to raw rural+urban when rate is 0 / NaN / negative", () => {
    for (const bad of [0, Number.NaN, -5]) {
      const result = readReligionDistributionFromPack(
        asPack(makePack()),
        bad,
      ) as ReligionDistribution;
      const byId = new Map(result.religions.map((r) => [r.i, r.followers]));
      expect(byId.get(1)).toBe(80);
      expect(byId.get(2)).toBe(15);
      expect(byId.get(4)).toBe(200);
    }
  });

  it("maps missing optional fields to null", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      1,
    ) as ReligionDistribution;
    const shadow = result.religions.find((r) => r.i === 5);
    expect(shadow).toMatchObject({
      i: 5,
      name: "Shadowcreed",
      color: null,
      type: null,
      form: null,
    });
  });

  it("treats missing numeric fields as 0", () => {
    const result = readReligionDistributionFromPack(
      asPack(makePack()),
      1,
    ) as ReligionDistribution;
    const shadow = result.religions.find((r) => r.i === 5);
    expect(shadow?.cells_count).toBe(0);
    expect(shadow?.area).toBe(0);
    expect(shadow?.followers).toBe(0);
  });

  it("sets percentage to 0 when total_cells is 0", () => {
    const pack = {
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "A", cells: 0, rural: 5 },
        { i: 2, name: "B", cells: 0, rural: 10 },
      ],
    } as unknown as ReligionDistributionPackLike;
    const result = readReligionDistributionFromPack(
      pack,
      1,
    ) as ReligionDistribution;
    expect(result.total_cells).toBe(0);
    for (const r of result.religions) {
      expect(r.percentage).toBe(0);
    }
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readReligionDistributionFromPack(undefined, 1)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.religions is missing", () => {
    const pack = {} as ReligionDistributionPackLike;
    expect(readReligionDistributionFromPack(pack, 1)).toBe("not-ready");
  });

  it("empty religions list yields zero totals and empty array", () => {
    const pack = {
      religions: [],
    } as unknown as ReligionDistributionPackLike;
    const result = readReligionDistributionFromPack(
      pack,
      1,
    ) as ReligionDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.total_followers).toBe(0);
    expect(result.religions).toEqual([]);
  });

  it("pack with only placeholder/removed yields empty result", () => {
    const pack = {
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Gone", removed: true, cells: 100 },
      ],
    } as unknown as ReligionDistributionPackLike;
    const result = readReligionDistributionFromPack(
      pack,
      1,
    ) as ReligionDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.religions).toEqual([]);
  });

  it("skips falsy slots (undefined / null)", () => {
    const pack = {
      religions: [
        { i: 0 },
        undefined,
        { i: 2, name: "Real", cells: 5, rural: 10 },
      ],
    } as unknown as ReligionDistributionPackLike;
    const result = readReligionDistributionFromPack(
      pack,
      1,
    ) as ReligionDistribution;
    expect(result.religions).toHaveLength(1);
    expect(result.religions[0].i).toBe(2);
  });
});

describe("get_religion_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetReligionDistributionTool(realRuntime(1));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(100);
    expect(Array.isArray(body.religions)).toBe(true);
    expect(body.religions).toHaveLength(4);
    expect(body.religions.map((r: { i: number }) => r.i)).toEqual([4, 2, 1, 5]);
  });

  it("returns integer-rounded followers scaled by populationRate", async () => {
    const tool = createGetReligionDistributionTool(realRuntime(1000));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    const byId = new Map<number, number>(
      body.religions.map((r: { i: number; followers: number }) => [
        r.i,
        r.followers,
      ]),
    );
    expect(byId.get(1)).toBe(80000);
    expect(byId.get(4)).toBe(200000);
    expect(body.total_followers).toBe(295000);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetReligionDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetReligionDistributionTool(
      runtimeReturning("not-ready"),
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getReligionDistributionTool with the expected schema", () => {
    expect(getReligionDistributionTool.name).toBe("get_religion_distribution");
    expect(getReligionDistributionTool.input_schema.type).toBe("object");
    expect(getReligionDistributionTool.input_schema.required).toBeUndefined();
    expect(getReligionDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultReligionDistributionRuntime integration -----

describe("defaultReligionDistributionRuntime (integration)", () => {
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
      defaultReligionDistributionRuntime.readDistribution() as ReligionDistribution;
    expect(result.total_cells).toBe(100);
    expect(result.religions.map((r) => r.i)).toEqual([4, 2, 1, 5]);
    // Brighthymn followers: 200 * 1000 = 200000
    expect(result.religions[0].followers).toBe(200000);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getReligionDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(100);
    expect(body.total_followers).toBe(295000);
    expect(body.religions[0].i).toBe(4);
    expect(body.religions[0].name).toBe("Brighthymn");
    expect(body.religions[0].percentage).toBeCloseTo(50);
  });

  it("falls back to rate=1 when populationRate global is missing", () => {
    globalsRef.populationRate = undefined;
    const result =
      defaultReligionDistributionRuntime.readDistribution() as ReligionDistribution;
    // Brighthymn: rural+urban = 200 * 1 = 200
    const brighthymn = result.religions.find((r) => r.i === 4);
    expect(brighthymn?.followers).toBe(200);
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultReligionDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getReligionDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
