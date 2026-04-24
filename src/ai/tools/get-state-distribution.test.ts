import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetStateDistributionTool,
  defaultStateDistributionRuntime,
  getStateDistributionTool,
  readStateDistributionFromPack,
  type StateDistribution,
  type StateDistributionPackLike,
  type StateDistributionRuntime,
} from "./get-state-distribution";

interface FakeState {
  i: number;
  name?: string;
  fullName?: string;
  form?: string;
  color?: string;
  capital?: number;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  removed?: boolean;
}

interface FakeBurg {
  i: number;
  name?: string;
}

interface FakePack {
  states: Array<FakeState | undefined>;
  burgs: Array<FakeBurg | undefined>;
}

function makePack(): FakePack {
  // States:
  //   0: "Neutrals" placeholder
  //   1: Altaria     cells=20 area=100 rural=50  urban=30  capital=1 (Alta)
  //   2: Borealis    cells=30 area=80  rural=10  urban=5   capital=2 (Bor)
  //   3: Gone        removed (should be skipped)
  //   4: Castellan   cells=50 area=60  rural=100 urban=100 capital=3 (missing burg slot)
  //   5: Drifts      cells=0  area=0   (missing fields, no capital)
  //
  // Burgs:
  //   0: placeholder (null in our shape)
  //   1: Alta
  //   2: Bor
  //   (no slot 3; simulates missing burg)
  return {
    states: [
      { i: 0, name: "Neutrals" },
      {
        i: 1,
        name: "Altaria",
        fullName: "Kingdom of Altaria",
        form: "Monarchy",
        color: "#ff0000",
        capital: 1,
        cells: 20,
        area: 100,
        rural: 50,
        urban: 30,
      },
      {
        i: 2,
        name: "Borealis",
        fullName: "Republic of Borealis",
        form: "Republic",
        color: "#00ff00",
        capital: 2,
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
        name: "Castellan",
        fullName: "Empire of Castellan",
        form: "Empire",
        color: "#0000ff",
        capital: 3, // index points at a burg slot that does not exist
        cells: 50,
        area: 60,
        rural: 100,
        urban: 100,
      },
      { i: 5, name: "Drifts" },
    ],
    burgs: [undefined, { i: 1, name: "Alta" }, { i: 2, name: "Bor" }],
  };
}

function asPack(p: FakePack): StateDistributionPackLike {
  return p as unknown as StateDistributionPackLike;
}

function runtimeReturning(
  result: StateDistribution | "not-ready",
): StateDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(populationRate = 1): StateDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () => readStateDistributionFromPack(pack, populationRate),
  };
}

describe("get_state_distribution — pure aggregator", () => {
  it("skips index-0 placeholder and removed states", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    const ids = result.states.map((s) => s.i);
    expect(ids).not.toContain(0);
    expect(ids).not.toContain(3); // removed
    expect(ids).toEqual(expect.arrayContaining([1, 2, 4, 5]));
  });

  it("sorts states by cells_count descending", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    // Active cells: 4(50), 2(30), 1(20), 5(0)
    expect(result.states.map((s) => s.i)).toEqual([4, 2, 1, 5]);
  });

  it("computes total_cells as sum of active state.cells", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    // 20 + 30 + 50 + 0 = 100
    expect(result.total_cells).toBe(100);
  });

  it("computes total_population as sum of scaled rural+urban", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      10,
    ) as StateDistribution;
    // rate=10; pop: 1→(50+30)*10=800; 2→(10+5)*10=150; 4→(100+100)*10=2000; 5→0
    // total = 800 + 150 + 2000 + 0 = 2950
    expect(result.total_population).toBe(2950);
  });

  it("computes percentage as cells_count / total_cells * 100", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    // total=100; 4=50%, 2=30%, 1=20%, 5=0%
    const byId = new Map(result.states.map((s) => [s.i, s.percentage]));
    expect(byId.get(4)).toBeCloseTo(50);
    expect(byId.get(2)).toBeCloseTo(30);
    expect(byId.get(1)).toBeCloseTo(20);
    expect(byId.get(5)).toBeCloseTo(0);
  });

  it("scales population by populationRate", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1000,
    ) as StateDistribution;
    const byId = new Map(result.states.map((s) => [s.i, s.population]));
    expect(byId.get(1)).toBe(80 * 1000);
    expect(byId.get(2)).toBe(15 * 1000);
    expect(byId.get(4)).toBe(200 * 1000);
    expect(byId.get(5)).toBe(0);
  });

  it("falls back to raw rural+urban when rate is 0 / NaN / negative", () => {
    for (const bad of [0, Number.NaN, -5]) {
      const result = readStateDistributionFromPack(
        asPack(makePack()),
        bad,
      ) as StateDistribution;
      const byId = new Map(result.states.map((s) => [s.i, s.population]));
      expect(byId.get(1)).toBe(80);
      expect(byId.get(2)).toBe(15);
      expect(byId.get(4)).toBe(200);
    }
  });

  it("resolves capital names via pack.burgs[state.capital].name", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    const byId = new Map(result.states.map((s) => [s.i, s.capital]));
    expect(byId.get(1)).toBe("Alta");
    expect(byId.get(2)).toBe("Bor");
  });

  it("returns null capital when state.capital is 0 or missing", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    const drifts = result.states.find((s) => s.i === 5);
    expect(drifts?.capital).toBeNull();
  });

  it("returns null capital when the burg slot is missing or undefined", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    // state 4 points at capital=3, but burgs[3] is undefined
    const castellan = result.states.find((s) => s.i === 4);
    expect(castellan?.capital).toBeNull();
  });

  it("maps missing optional fields to null", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    const drifts = result.states.find((s) => s.i === 5);
    expect(drifts).toMatchObject({
      i: 5,
      name: "Drifts",
      fullName: null,
      form: null,
      color: null,
      capital: null,
    });
  });

  it("treats missing numeric fields as 0", () => {
    const result = readStateDistributionFromPack(
      asPack(makePack()),
      1,
    ) as StateDistribution;
    const drifts = result.states.find((s) => s.i === 5);
    expect(drifts?.cells_count).toBe(0);
    expect(drifts?.area).toBe(0);
    expect(drifts?.population).toBe(0);
  });

  it("sets percentage to 0 when total_cells is 0", () => {
    const pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "A", cells: 0, rural: 5 },
        { i: 2, name: "B", cells: 0, rural: 10 },
      ],
      burgs: [],
    } as unknown as StateDistributionPackLike;
    const result = readStateDistributionFromPack(pack, 1) as StateDistribution;
    expect(result.total_cells).toBe(0);
    for (const s of result.states) {
      expect(s.percentage).toBe(0);
    }
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readStateDistributionFromPack(undefined, 1)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as StateDistributionPackLike;
    expect(readStateDistributionFromPack(pack, 1)).toBe("not-ready");
  });

  it("empty states list yields zero totals and empty array", () => {
    const pack = {
      states: [],
      burgs: [],
    } as unknown as StateDistributionPackLike;
    const result = readStateDistributionFromPack(pack, 1) as StateDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.total_population).toBe(0);
    expect(result.states).toEqual([]);
  });

  it("pack with only placeholder/removed yields empty result", () => {
    const pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Gone", removed: true, cells: 100 },
      ],
      burgs: [],
    } as unknown as StateDistributionPackLike;
    const result = readStateDistributionFromPack(pack, 1) as StateDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.states).toEqual([]);
  });

  it("skips falsy slots (undefined / null)", () => {
    const pack = {
      states: [
        { i: 0 },
        undefined,
        { i: 2, name: "Real", cells: 5, rural: 10 },
      ],
      burgs: [],
    } as unknown as StateDistributionPackLike;
    const result = readStateDistributionFromPack(pack, 1) as StateDistribution;
    expect(result.states).toHaveLength(1);
    expect(result.states[0].i).toBe(2);
  });

  it("works when pack.burgs is missing entirely", () => {
    const pack = {
      states: [
        { i: 0 },
        { i: 1, name: "Noburg", capital: 5, cells: 10, rural: 5 },
      ],
    } as unknown as StateDistributionPackLike;
    const result = readStateDistributionFromPack(pack, 1) as StateDistribution;
    expect(result.states).toHaveLength(1);
    expect(result.states[0].capital).toBeNull();
  });
});

describe("get_state_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetStateDistributionTool(realRuntime(1));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(100);
    expect(Array.isArray(body.states)).toBe(true);
    expect(body.states).toHaveLength(4);
    expect(body.states.map((s: { i: number }) => s.i)).toEqual([4, 2, 1, 5]);
  });

  it("returns integer-rounded population scaled by populationRate", async () => {
    const tool = createGetStateDistributionTool(realRuntime(1000));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    const byId = new Map<number, number>(
      body.states.map((s: { i: number; population: number }) => [
        s.i,
        s.population,
      ]),
    );
    expect(byId.get(1)).toBe(80000);
    expect(byId.get(4)).toBe(200000);
    expect(body.total_population).toBe(295000);
  });

  it("includes resolved capital names in the payload", async () => {
    const tool = createGetStateDistributionTool(realRuntime(1));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    const byId = new Map<number, string | null>(
      body.states.map((s: { i: number; capital: string | null }) => [
        s.i,
        s.capital,
      ]),
    );
    expect(byId.get(1)).toBe("Alta");
    expect(byId.get(2)).toBe("Bor");
    expect(byId.get(4)).toBeNull();
    expect(byId.get(5)).toBeNull();
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetStateDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetStateDistributionTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getStateDistributionTool with the expected schema", () => {
    expect(getStateDistributionTool.name).toBe("get_state_distribution");
    expect(getStateDistributionTool.input_schema.type).toBe("object");
    expect(getStateDistributionTool.input_schema.required).toBeUndefined();
    expect(getStateDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultStateDistributionRuntime integration -----

describe("defaultStateDistributionRuntime (integration)", () => {
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
      defaultStateDistributionRuntime.readDistribution() as StateDistribution;
    expect(result.total_cells).toBe(100);
    expect(result.states.map((s) => s.i)).toEqual([4, 2, 1, 5]);
    // Castellan population: 200 * 1000 = 200000
    expect(result.states[0].population).toBe(200000);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getStateDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(100);
    expect(body.total_population).toBe(295000);
    expect(body.states[0].i).toBe(4);
    expect(body.states[0].name).toBe("Castellan");
    expect(body.states[0].percentage).toBeCloseTo(50);
  });

  it("falls back to rate=1 when populationRate global is missing", () => {
    globalsRef.populationRate = undefined;
    const result =
      defaultStateDistributionRuntime.readDistribution() as StateDistribution;
    // Castellan: rural+urban = 200 * 1 = 200
    const castellan = result.states.find((s) => s.i === 4);
    expect(castellan?.population).toBe(200);
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultStateDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getStateDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
