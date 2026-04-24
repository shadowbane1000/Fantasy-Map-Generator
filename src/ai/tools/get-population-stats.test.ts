import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetPopulationStatsTool,
  DEFAULT_TOP_N,
  defaultPopulationStatsRuntime,
  getPopulationStatsTool,
  MAX_TOP_N,
  type PopulationRates,
  type PopulationStats,
  type PopulationStatsPackLike,
  type PopulationStatsRuntime,
  readPopulationStatsFromPack,
} from "./get-population-stats";

interface FakeBurg {
  i: number;
  name?: string;
  population?: number;
  removed?: boolean;
}

interface FakeState {
  i: number;
  name?: string;
  rural?: number;
  urban?: number;
  removed?: boolean;
}

interface FakePack {
  states: Array<FakeState | undefined>;
  burgs: Array<FakeBurg | undefined>;
  cells: { pop: number[] };
}

function makePack(): FakePack {
  return {
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Altaria", rural: 50, urban: 20 },
      { i: 2, name: "Brigantia", rural: 200, urban: 40 },
      { i: 3, name: "Cirdan", rural: 10, urban: 5 },
      { i: 4, name: "Removed", rural: 9999, urban: 9999, removed: true },
    ],
    burgs: [
      { i: 0, name: "placeholder" },
      { i: 1, name: "Ironhold", population: 8 }, // mid
      { i: 2, name: "Stormport", population: 40 }, // biggest
      { i: 3, name: "Oldham", population: 5, removed: true }, // skipped
      { i: 4, name: "Lowbury", population: 2 }, // smallest active
      { i: 5, name: "Highcrag", population: 20 }, // second biggest
    ],
    cells: {
      // total = 100 (non-negative, finite)
      pop: [0, 5, 10, 20, 25, 40, 0, Number.NaN as unknown as number, -3, 0],
    },
  };
}

function makeRates(overrides: Partial<PopulationRates> = {}): PopulationRates {
  return { populationRate: 1000, urbanization: 2, ...overrides };
}

function runtimeReturning(
  result: PopulationStats | "not-ready",
): PopulationStatsRuntime {
  return { readStats: () => result };
}

describe("get_population_stats tool — pure / seam", () => {
  it("computes correct rural, urban, and total population", () => {
    const pack = makePack();
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      makeRates(),
      10,
    ) as PopulationStats;

    // rural = sum(cells.pop non-negative finite) = 5+10+20+25+40 = 100
    // rural * rate = 100 * 1000 = 100000
    expect(stats.rural_population).toBe(100000);

    // urban raw = 8+40+2+20 = 70 (index 0, removed skipped)
    // urban * rate * urbanization = 70 * 1000 * 2 = 140000
    expect(stats.urban_population).toBe(140000);

    // total = rural * rate + urban * rate * urbanization = 100000 + 140000 = 240000
    expect(stats.population_total).toBe(240000);

    expect(stats.population_rate).toBe(1000);
    expect(stats.urbanization).toBe(2);
  });

  it("returns top states sorted desc by population, skipping id 0 / removed", () => {
    const pack = makePack();
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      makeRates(),
      10,
    ) as PopulationStats;

    // state 1: (50+20)*1000 = 70000
    // state 2: (200+40)*1000 = 240000
    // state 3: (10+5)*1000 = 15000
    // state 4: removed, skipped
    // state 0: neutrals, skipped
    expect(stats.top_states.map((s) => s.i)).toEqual([2, 1, 3]);
    expect(stats.top_states[0]).toEqual({
      i: 2,
      name: "Brigantia",
      population: 240000,
    });
    expect(stats.top_states[2]).toEqual({
      i: 3,
      name: "Cirdan",
      population: 15000,
    });
  });

  it("returns top burgs sorted desc by population, skipping index 0 / removed", () => {
    const pack = makePack();
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      makeRates(),
      10,
    ) as PopulationStats;

    // burg populations after scaling (rate=1000, urbanization=2):
    // i=1 Ironhold: 8*1000*2 = 16000
    // i=2 Stormport: 40*1000*2 = 80000
    // i=3 Oldham: removed
    // i=4 Lowbury: 2*1000*2 = 4000
    // i=5 Highcrag: 20*1000*2 = 40000
    expect(stats.top_burgs.map((b) => b.i)).toEqual([2, 5, 1, 4]);
    expect(stats.top_burgs[0]).toEqual({
      i: 2,
      name: "Stormport",
      population: 80000,
    });
  });

  it("top_n limits the returned lists", () => {
    const pack = makePack();
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      makeRates(),
      2,
    ) as PopulationStats;
    expect(stats.top_states).toHaveLength(2);
    expect(stats.top_burgs).toHaveLength(2);
    expect(stats.top_states.map((s) => s.i)).toEqual([2, 1]);
    expect(stats.top_burgs.map((b) => b.i)).toEqual([2, 5]);
  });

  it("top_n = 0 returns empty top lists but still computes totals", () => {
    const pack = makePack();
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      makeRates(),
      0,
    ) as PopulationStats;
    expect(stats.top_states).toEqual([]);
    expect(stats.top_burgs).toEqual([]);
    expect(stats.population_total).toBe(240000);
  });

  it("top_n > available returns all candidates", () => {
    const pack = makePack();
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      makeRates(),
      100,
    ) as PopulationStats;
    expect(stats.top_states).toHaveLength(3);
    expect(stats.top_burgs).toHaveLength(4);
  });

  it("applies safe-multiplier fallback when rates are 0 / NaN / negative", () => {
    const pack = makePack();
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      { populationRate: 0, urbanization: Number.NaN },
      10,
    ) as PopulationStats;
    // Both fall back to 1.
    expect(stats.population_rate).toBe(1);
    expect(stats.urbanization).toBe(1);
    expect(stats.rural_population).toBe(100);
    expect(stats.urban_population).toBe(70);
  });

  it("returns 'not-ready' when pack / cells / burgs / states missing", () => {
    expect(readPopulationStatsFromPack(undefined, makeRates(), 10)).toBe(
      "not-ready",
    );
    expect(
      readPopulationStatsFromPack(
        { burgs: [], states: [] } as PopulationStatsPackLike,
        makeRates(),
        10,
      ),
    ).toBe("not-ready");
    expect(
      readPopulationStatsFromPack(
        { cells: {}, states: [] } as PopulationStatsPackLike,
        makeRates(),
        10,
      ),
    ).toBe("not-ready");
    expect(
      readPopulationStatsFromPack(
        { cells: {}, burgs: [] } as PopulationStatsPackLike,
        makeRates(),
        10,
      ),
    ).toBe("not-ready");
  });

  it("missing cells.pop is treated as zero rural", () => {
    const pack = makePack();
    pack.cells = { pop: [] };
    const stats = readPopulationStatsFromPack(
      pack as PopulationStatsPackLike,
      makeRates(),
      10,
    ) as PopulationStats;
    expect(stats.rural_population).toBe(0);
  });
});

describe("get_population_stats tool — surface", () => {
  it("returns a valid JSON payload with the expected fields", async () => {
    const pack = makePack();
    const tool = createGetPopulationStatsTool({
      readStats: (n) =>
        readPopulationStatsFromPack(
          pack as PopulationStatsPackLike,
          makeRates(),
          n,
        ),
    });
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.population_total).toBe(240000);
    expect(body.urban_population).toBe(140000);
    expect(body.rural_population).toBe(100000);
    expect(body.population_rate).toBe(1000);
    expect(body.urbanization).toBe(2);
    expect(Array.isArray(body.top_states)).toBe(true);
    expect(Array.isArray(body.top_burgs)).toBe(true);
  });

  it("default top_n is 10", async () => {
    let received = -1;
    const tool = createGetPopulationStatsTool({
      readStats: (n) => {
        received = n;
        return {
          population_total: 0,
          urban_population: 0,
          rural_population: 0,
          top_states: [],
          top_burgs: [],
          population_rate: 1,
          urbanization: 1,
        };
      },
    });
    await tool.execute({});
    expect(received).toBe(DEFAULT_TOP_N);
    expect(DEFAULT_TOP_N).toBe(10);
  });

  it("respects an explicit top_n", async () => {
    const pack = makePack();
    const tool = createGetPopulationStatsTool({
      readStats: (n) =>
        readPopulationStatsFromPack(
          pack as PopulationStatsPackLike,
          makeRates(),
          n,
        ),
    });
    const result = await tool.execute({ top_n: 1 });
    const body = JSON.parse(result.content);
    expect(body.top_states).toHaveLength(1);
    expect(body.top_burgs).toHaveLength(1);
  });

  it("rejects non-integer top_n", async () => {
    const tool = createGetPopulationStatsTool(
      runtimeReturning({
        population_total: 0,
        urban_population: 0,
        rural_population: 0,
        top_states: [],
        top_burgs: [],
        population_rate: 1,
        urbanization: 1,
      }),
    );
    for (const bad of [1.5, "10", true, [], {}]) {
      const r = await tool.execute({ top_n: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/integer/i);
    }
  });

  it("rejects negative top_n", async () => {
    const tool = createGetPopulationStatsTool(
      runtimeReturning({
        population_total: 0,
        urban_population: 0,
        rural_population: 0,
        top_states: [],
        top_burgs: [],
        population_rate: 1,
        urbanization: 1,
      }),
    );
    const r = await tool.execute({ top_n: -1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/>= 0/i);
  });

  it("rejects top_n > MAX_TOP_N", async () => {
    const tool = createGetPopulationStatsTool(
      runtimeReturning({
        population_total: 0,
        urban_population: 0,
        rural_population: 0,
        top_states: [],
        top_burgs: [],
        population_rate: 1,
        urbanization: 1,
      }),
    );
    const r = await tool.execute({ top_n: MAX_TOP_N + 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/<=/);
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetPopulationStatsTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("ignores unrelated input keys", async () => {
    const pack = makePack();
    const tool = createGetPopulationStatsTool({
      readStats: (n) =>
        readPopulationStatsFromPack(
          pack as PopulationStatsPackLike,
          makeRates(),
          n,
        ),
    });
    const result = await tool.execute({ unused: true, something: "else" });
    expect(result.isError).toBeFalsy();
  });

  it("is exported as getPopulationStatsTool with the expected schema", () => {
    expect(getPopulationStatsTool.name).toBe("get_population_stats");
    expect(getPopulationStatsTool.input_schema.type).toBe("object");
    expect(getPopulationStatsTool.input_schema.required).toBeUndefined();
    expect(getPopulationStatsTool.input_schema.properties.top_n).toBeDefined();
  });

  it("exports DEFAULT_TOP_N and MAX_TOP_N constants", () => {
    expect(DEFAULT_TOP_N).toBe(10);
    expect(MAX_TOP_N).toBe(500);
  });
});

// ----- defaultPopulationStatsRuntime integration -----

describe("defaultPopulationStatsRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    populationRate?: unknown;
    urbanization?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalRate = globalsRef.populationRate;
  const originalUrban = globalsRef.urbanization;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.populationRate = 1000;
    globalsRef.urbanization = 2;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.populationRate = originalRate;
    globalsRef.urbanization = originalUrban;
  });

  it("reads real aggregate stats through the default runtime", () => {
    const stats = defaultPopulationStatsRuntime.readStats(10);
    expect(stats).not.toBe("not-ready");
    const s = stats as PopulationStats;
    expect(s.population_total).toBe(240000);
    expect(s.rural_population).toBe(100000);
    expect(s.urban_population).toBe(140000);
    expect(s.top_states[0]?.name).toBe("Brigantia");
    expect(s.top_burgs[0]?.name).toBe("Stormport");
  });

  it("returns 'not-ready' when pack is missing and the tool surfaces it", async () => {
    globalsRef.pack = undefined;
    expect(defaultPopulationStatsRuntime.readStats(10)).toBe("not-ready");
    const result = await getPopulationStatsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("uses live populationRate / urbanization from globals", () => {
    globalsRef.populationRate = 1;
    globalsRef.urbanization = 1;
    const stats = defaultPopulationStatsRuntime.readStats(
      10,
    ) as PopulationStats;
    expect(stats.population_rate).toBe(1);
    expect(stats.urbanization).toBe(1);
    // ruralRaw=100, urbanRaw=70 → total = 100 + 70 = 170
    expect(stats.population_total).toBe(170);
  });
});
