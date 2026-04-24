import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BurgDistribution,
  type BurgDistributionPackLike,
  type BurgDistributionRuntime,
  createGetBurgDistributionTool,
  defaultBurgDistributionRuntime,
  getBurgDistributionTool,
  readBurgDistributionFromPack,
} from "./get-burg-distribution";

interface FakeBurg {
  i: number;
  name?: string;
  type?: string;
  population?: number;
  removed?: boolean;
}

interface FakePack {
  burgs: Array<FakeBurg | undefined | null>;
}

function asPack(p: FakePack): BurgDistributionPackLike {
  return p as unknown as BurgDistributionPackLike;
}

function makePack(): FakePack {
  // Burgs:
  //   0: placeholder (must be skipped)
  //   1: Generic     pop 10
  //   2: generic     pop 5    (legacy lower-case, same bucket)
  //   3: Generic     pop 3
  //   4: Naval       pop 20
  //   5: Naval       pop 4
  //   6: River       pop 6
  //   7: Highland    pop 2    removed=true (skipped)
  //   8: (no type)   pop 1    → Generic bucket fallback
  //   9: "Metropolis" pop 7   → non-canonical → Generic fallback
  //  10: ""          pop 9    → empty → Generic fallback
  return {
    burgs: [
      { i: 0 },
      { i: 1, name: "Astral", type: "Generic", population: 10 },
      { i: 2, name: "Birchwell", type: "generic", population: 5 },
      { i: 3, name: "Coldreach", type: "Generic", population: 3 },
      { i: 4, name: "Dusktown", type: "Naval", population: 20 },
      { i: 5, name: "Emberport", type: "Naval", population: 4 },
      { i: 6, name: "Freybrook", type: "River", population: 6 },
      {
        i: 7,
        name: "Gone",
        type: "Highland",
        population: 2,
        removed: true,
      },
      { i: 8, name: "Orphan", population: 1 },
      { i: 9, name: "Meta", type: "Metropolis", population: 7 },
      { i: 10, name: "Blank", type: "", population: 9 },
    ],
  };
}

function runtimeReturning(
  result: BurgDistribution | "not-ready",
): BurgDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(rate = 1000, urban = 1): BurgDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () =>
      readBurgDistributionFromPack(pack, {
        populationRate: rate,
        urbanization: urban,
      }),
  };
}

describe("get_burg_distribution — pure aggregator", () => {
  it("skips the index-0 placeholder and removed burgs", () => {
    const result = readBurgDistributionFromPack(asPack(makePack()), {
      populationRate: 1,
      urbanization: 1,
    }) as BurgDistribution;
    // Active: 1, 2, 3, 4, 5, 6, 8, 9, 10 = 9 burgs. 0 skipped. 7 removed.
    expect(result.total_burgs).toBe(9);
  });

  it("merges case-insensitive burg types into canonical buckets", () => {
    const result = readBurgDistributionFromPack(asPack(makePack()), {
      populationRate: 1,
      urbanization: 1,
    }) as BurgDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    // Generic gets: 1 (Generic), 2 (generic), 3 (Generic), 8 (no type),
    //               9 (Metropolis→fallback), 10 ("" →fallback) = 6
    expect(byType.get("Generic")?.count).toBe(6);
    expect(byType.get("Naval")?.count).toBe(2);
    expect(byType.get("River")?.count).toBe(1);
  });

  it("rolls missing / empty / non-canonical types into the Generic bucket", () => {
    const result = readBurgDistributionFromPack(
      asPack({
        burgs: [
          { i: 0 },
          { i: 1, name: "NoType", population: 2 }, // missing
          { i: 2, name: "EmptyType", type: "", population: 3 }, // empty
          { i: 3, name: "Weird", type: "Metropolis", population: 4 }, // unknown
          { i: 4, name: "Whitespace", type: "   ", population: 5 }, // blank
        ],
      }),
      { populationRate: 1, urbanization: 1 },
    ) as BurgDistribution;
    expect(result.total_burgs).toBe(4);
    expect(result.by_type).toEqual([
      {
        type: "Generic",
        count: 4,
        population: 14,
        percentage: 100,
      },
    ]);
  });

  it("scales population with populationRate × urbanization (rounded)", () => {
    const result = readBurgDistributionFromPack(asPack(makePack()), {
      populationRate: 1000,
      urbanization: 1,
    }) as BurgDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    // Generic raw population = 10 + 5 + 3 + 1 + 7 + 9 = 35 → 35000
    // Naval raw = 20 + 4 = 24 → 24000
    // River raw = 6 → 6000
    expect(byType.get("Generic")?.population).toBe(35000);
    expect(byType.get("Naval")?.population).toBe(24000);
    expect(byType.get("River")?.population).toBe(6000);
    // total = 35000 + 24000 + 6000 = 65000
    expect(result.total_population).toBe(65000);
  });

  it("uses rate <= 0 / NaN fallback of 1", () => {
    const r1 = readBurgDistributionFromPack(asPack(makePack()), {
      populationRate: 0,
      urbanization: 1,
    }) as BurgDistribution;
    // fallback: rate = 1 → raw Generic sum 35
    const g1 = r1.by_type.find((e) => e.type === "Generic");
    expect(g1?.population).toBe(35);

    const r2 = readBurgDistributionFromPack(asPack(makePack()), {
      populationRate: Number.NaN,
      urbanization: -5,
    }) as BurgDistribution;
    const g2 = r2.by_type.find((e) => e.type === "Generic");
    expect(g2?.population).toBe(35);
  });

  it("coerces missing / non-finite burg.population to 0 in the sum", () => {
    const result = readBurgDistributionFromPack(
      asPack({
        burgs: [
          { i: 0 },
          { i: 1, type: "Generic", population: 10 },
          {
            i: 2,
            type: "Generic",
            population: Number.NaN,
          } as unknown as FakeBurg,
          { i: 3, type: "Generic" }, // missing
          {
            i: 4,
            type: "Generic",
            population: -5,
          } as unknown as FakeBurg, // negative → coerced to 0
        ],
      }),
      { populationRate: 1, urbanization: 1 },
    ) as BurgDistribution;
    const g = result.by_type.find((e) => e.type === "Generic");
    expect(g?.count).toBe(4);
    expect(g?.population).toBe(10);
  });

  it("computes percentage as count / total_burgs * 100 and sums to ~100", () => {
    const result = readBurgDistributionFromPack(asPack(makePack()), {
      populationRate: 1,
      urbanization: 1,
    }) as BurgDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e.percentage]));
    // total = 9
    expect(byType.get("Generic")).toBeCloseTo((6 / 9) * 100);
    expect(byType.get("Naval")).toBeCloseTo((2 / 9) * 100);
    expect(byType.get("River")).toBeCloseTo((1 / 9) * 100);
    const sum = result.by_type.reduce((acc, e) => acc + e.percentage, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("sorts by_type by count desc, ties broken by type asc", () => {
    const result = readBurgDistributionFromPack(
      asPack({
        burgs: [
          { i: 0 },
          // three equal-count types to test alphabetical tiebreak
          { i: 1, type: "Naval", population: 1 },
          { i: 2, type: "Naval", population: 1 },
          { i: 3, type: "River", population: 1 },
          { i: 4, type: "River", population: 1 },
          { i: 5, type: "Highland", population: 1 },
          { i: 6, type: "Highland", population: 1 },
        ],
      }),
      { populationRate: 1, urbanization: 1 },
    ) as BurgDistribution;
    // All three tie at count=2; canonical types ascending: Highland, Naval, River.
    expect(result.by_type.map((e) => e.type)).toEqual([
      "Highland",
      "Naval",
      "River",
    ]);
  });

  it("filters out empty canonical buckets from the output", () => {
    const result = readBurgDistributionFromPack(
      asPack({
        burgs: [{ i: 0 }, { i: 1, type: "Naval", population: 1 }],
      }),
      { populationRate: 1, urbanization: 1 },
    ) as BurgDistribution;
    expect(result.by_type).toHaveLength(1);
    expect(result.by_type[0].type).toBe("Naval");
  });

  it("returns zero totals and empty by_type for a burgs-only-placeholder pack", () => {
    const pack = { burgs: [{ i: 0 }] } as unknown as BurgDistributionPackLike;
    const result = readBurgDistributionFromPack(pack, {
      populationRate: 1,
      urbanization: 1,
    }) as BurgDistribution;
    expect(result.total_burgs).toBe(0);
    expect(result.total_population).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("tolerates null / undefined entries in burgs array", () => {
    const pack = {
      burgs: [
        null,
        undefined,
        { i: 0 },
        { i: 1, type: "Generic", population: 5 },
      ],
    } as unknown as BurgDistributionPackLike;
    const result = readBurgDistributionFromPack(pack, {
      populationRate: 1,
      urbanization: 1,
    }) as BurgDistribution;
    expect(result.total_burgs).toBe(1);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(
      readBurgDistributionFromPack(undefined, {
        populationRate: 1,
        urbanization: 1,
      }),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.burgs is missing", () => {
    const pack = {} as BurgDistributionPackLike;
    expect(
      readBurgDistributionFromPack(pack, {
        populationRate: 1,
        urbanization: 1,
      }),
    ).toBe("not-ready");
  });
});

describe("get_burg_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetBurgDistributionTool(realRuntime(1, 1));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_burgs).toBe(9);
    expect(Array.isArray(body.by_type)).toBe(true);
    expect(body.by_type[0].type).toBe("Generic");
    expect(body.by_type[0].count).toBe(6);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetBurgDistributionTool(realRuntime(1, 1));
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("tolerates null / undefined input", async () => {
    const tool = createGetBurgDistributionTool(realRuntime(1, 1));
    expect((await tool.execute(null)).isError).toBeFalsy();
    expect((await tool.execute(undefined)).isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetBurgDistributionTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getBurgDistributionTool with the expected schema", () => {
    expect(getBurgDistributionTool.name).toBe("get_burg_distribution");
    expect(getBurgDistributionTool.input_schema.type).toBe("object");
    expect(getBurgDistributionTool.input_schema.required).toBeUndefined();
    expect(getBurgDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultBurgDistributionRuntime integration -----

describe("defaultBurgDistributionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    populationRate?: unknown;
    urbanization?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalPopRate = globalsRef.populationRate;
  const originalUrban = globalsRef.urbanization;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
    globalsRef.populationRate = 1000;
    globalsRef.urbanization = 1;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.populationRate = originalPopRate;
    globalsRef.urbanization = originalUrban;
  });

  it("reads the real distribution through the default runtime", () => {
    const result =
      defaultBurgDistributionRuntime.readDistribution() as BurgDistribution;
    expect(result.total_burgs).toBe(9);
    // Generic raw = 35; scaled = 35000
    const generic = result.by_type.find((e) => e.type === "Generic");
    expect(generic?.population).toBe(35000);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getBurgDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_burgs).toBe(9);
    const byType = new Map<string, { count: number; population: number }>(
      body.by_type.map(
        (e: { type: string; count: number; population: number }) => [
          e.type,
          { count: e.count, population: e.population },
        ],
      ),
    );
    expect(byType.get("Generic")?.count).toBe(6);
    expect(byType.get("Naval")?.count).toBe(2);
    expect(byType.get("Naval")?.population).toBe(24000);
  });

  it("falls back to rate=1 when globals are missing or non-numeric", () => {
    globalsRef.populationRate = undefined;
    globalsRef.urbanization = "nope" as unknown;
    const result =
      defaultBurgDistributionRuntime.readDistribution() as BurgDistribution;
    const generic = result.by_type.find((e) => e.type === "Generic");
    expect(generic?.population).toBe(35); // raw sum
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultBurgDistributionRuntime.readDistribution()).toBe("not-ready");
    const result = await getBurgDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.burgs is missing → tool surfaces error", async () => {
    globalsRef.pack = {} as unknown;
    expect(defaultBurgDistributionRuntime.readDistribution()).toBe("not-ready");
  });
});
