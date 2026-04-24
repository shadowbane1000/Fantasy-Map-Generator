import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetFeatureDistributionTool,
  defaultFeatureDistributionRuntime,
  type FeatureDistribution,
  type FeatureDistributionPackLike,
  type FeatureDistributionRuntime,
  getFeatureDistributionTool,
  readFeatureDistributionFromPack,
} from "./get-feature-distribution";

interface FakeFeature {
  i?: number;
  type?: string;
  group?: string;
  land?: boolean;
  cells?: number;
  area?: number;
}

interface FakePack {
  features: Array<FakeFeature | 0 | undefined | null>;
}

function makePack(): FakePack {
  // Slots:
  //   0 → placeholder (generator writes 0 here; must be skipped)
  //   1 → continent   (type:"island",  group:"continent", land)
  //   2 → continent   (type:"island",  group:"continent", land)
  //   3 → island      (type:"island",  group:"isle",      land)
  //   4 → lake        (type:"lake",    group:"freshwater",water)
  //   5 → ocean       (type:"ocean",   group:"ocean",     water)
  //   6 → ocean       (type:"ocean",   group:"ocean",     water)
  //   7 → ocean       (type:"ocean",   group:"ocean",     water)
  //   8 → undefined   (falsy slot, must be skipped)
  //   9 → null        (falsy slot, must be skipped)
  return {
    features: [
      0,
      {
        i: 1,
        type: "island",
        group: "continent",
        land: true,
        cells: 200,
        area: 2000,
      },
      {
        i: 2,
        type: "island",
        group: "continent",
        land: true,
        cells: 150,
        area: 1500,
      },
      {
        i: 3,
        type: "island",
        group: "isle",
        land: true,
        cells: 20,
        area: 100,
      },
      {
        i: 4,
        type: "lake",
        group: "freshwater",
        land: false,
        cells: 5,
        area: 25,
      },
      {
        i: 5,
        type: "ocean",
        group: "ocean",
        land: false,
        cells: 500,
        area: 5000,
      },
      {
        i: 6,
        type: "ocean",
        group: "ocean",
        land: false,
        cells: 400,
        area: 4000,
      },
      {
        i: 7,
        type: "ocean",
        group: "ocean",
        land: false,
        cells: 300,
        area: 3000,
      },
      undefined,
      null,
    ],
  };
}

function asPack(p: FakePack): FeatureDistributionPackLike {
  return p as unknown as FeatureDistributionPackLike;
}

function runtimeReturning(
  result: FeatureDistribution | "not-ready",
): FeatureDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(): FeatureDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () => readFeatureDistributionFromPack(pack),
  };
}

describe("get_feature_distribution — pure aggregator", () => {
  it("skips the index-0 placeholder and falsy slots", () => {
    const result = readFeatureDistributionFromPack(
      asPack(makePack()),
    ) as FeatureDistribution;
    // 7 real features (1..7), slots 0, 8, 9 skipped.
    expect(result.features_total).toBe(7);
  });

  it("treats group='continent' as its own 'continent' group", () => {
    const result = readFeatureDistributionFromPack(
      asPack(makePack()),
    ) as FeatureDistribution;
    const types = result.by_type.map((e) => e.type);
    expect(types).toContain("continent");
    // island bucket exists but should NOT contain the two continents.
    const island = result.by_type.find((e) => e.type === "island");
    expect(island).toBeDefined();
    expect(island?.count).toBe(1); // only slot 3
    const continent = result.by_type.find((e) => e.type === "continent");
    expect(continent?.count).toBe(2);
  });

  it("aggregates count, cells, and area per type", () => {
    const result = readFeatureDistributionFromPack(
      asPack(makePack()),
    ) as FeatureDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    expect(byType.get("continent")).toMatchObject({
      count: 2,
      cells: 350,
      area: 3500,
    });
    expect(byType.get("island")).toMatchObject({
      count: 1,
      cells: 20,
      area: 100,
    });
    expect(byType.get("lake")).toMatchObject({
      count: 1,
      cells: 5,
      area: 25,
    });
    expect(byType.get("ocean")).toMatchObject({
      count: 3,
      cells: 1200,
      area: 12000,
    });
  });

  it("computes percentage as count / features_total * 100", () => {
    const result = readFeatureDistributionFromPack(
      asPack(makePack()),
    ) as FeatureDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e.percentage]));
    // features_total = 7
    expect(byType.get("ocean")).toBeCloseTo((3 / 7) * 100);
    expect(byType.get("continent")).toBeCloseTo((2 / 7) * 100);
    expect(byType.get("island")).toBeCloseTo((1 / 7) * 100);
    expect(byType.get("lake")).toBeCloseTo((1 / 7) * 100);
    // percentages sum to ~100.
    const sum = result.by_type.reduce((acc, e) => acc + e.percentage, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("sorts by_type by count desc, ties broken by type asc", () => {
    const result = readFeatureDistributionFromPack(
      asPack(makePack()),
    ) as FeatureDistribution;
    // counts: ocean 3, continent 2, island 1, lake 1
    // island and lake tie at 1 -> alphabetical: island then lake.
    expect(result.by_type.map((e) => e.type)).toEqual([
      "ocean",
      "continent",
      "island",
      "lake",
    ]);
  });

  it("counts land vs water features", () => {
    const result = readFeatureDistributionFromPack(
      asPack(makePack()),
    ) as FeatureDistribution;
    // land: 1, 2, 3 -> 3 ; water: 4, 5, 6, 7 -> 4
    expect(result.land_features).toBe(3);
    expect(result.water_features).toBe(4);
  });

  it("coerces missing or non-finite cells / area to 0", () => {
    const pack = {
      features: [
        0,
        { i: 1, type: "island", land: true }, // missing cells + area
        {
          i: 2,
          type: "ocean",
          land: false,
          cells: Number.NaN,
          area: "nope",
        },
      ],
    } as unknown as FeatureDistributionPackLike;
    const result = readFeatureDistributionFromPack(pack) as FeatureDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    expect(byType.get("island")).toMatchObject({ cells: 0, area: 0 });
    expect(byType.get("ocean")).toMatchObject({ cells: 0, area: 0 });
  });

  it("classifies features with neither type nor group as 'unknown'", () => {
    const pack = {
      features: [
        0,
        { i: 1, land: true, cells: 10, area: 20 }, // no type, no group
        { i: 2, land: false, cells: 5, area: 10, group: "" }, // empty group
      ],
    } as unknown as FeatureDistributionPackLike;
    const result = readFeatureDistributionFromPack(pack) as FeatureDistribution;
    expect(result.features_total).toBe(2);
    expect(result.by_type).toHaveLength(1);
    expect(result.by_type[0]).toMatchObject({
      type: "unknown",
      count: 2,
      cells: 15,
      area: 30,
    });
  });

  it("returns zero totals and empty by_type for a features-only-placeholder pack", () => {
    const pack = {
      features: [0],
    } as unknown as FeatureDistributionPackLike;
    const result = readFeatureDistributionFromPack(pack) as FeatureDistribution;
    expect(result.features_total).toBe(0);
    expect(result.land_features).toBe(0);
    expect(result.water_features).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("treats all-falsy feature slots as empty", () => {
    const pack = {
      features: [0, undefined, null, 0],
    } as unknown as FeatureDistributionPackLike;
    const result = readFeatureDistributionFromPack(pack) as FeatureDistribution;
    expect(result.features_total).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readFeatureDistributionFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.features is missing", () => {
    const pack = {} as FeatureDistributionPackLike;
    expect(readFeatureDistributionFromPack(pack)).toBe("not-ready");
  });
});

describe("get_feature_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetFeatureDistributionTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.features_total).toBe(7);
    expect(body.land_features).toBe(3);
    expect(body.water_features).toBe(4);
    expect(Array.isArray(body.by_type)).toBe(true);
    expect(body.by_type[0].type).toBe("ocean");
    expect(body.by_type[0].count).toBe(3);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetFeatureDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("tolerates null / undefined input", async () => {
    const tool = createGetFeatureDistributionTool(realRuntime());
    expect((await tool.execute(null)).isError).toBeFalsy();
    expect((await tool.execute(undefined)).isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetFeatureDistributionTool(
      runtimeReturning("not-ready"),
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getFeatureDistributionTool with the expected schema", () => {
    expect(getFeatureDistributionTool.name).toBe("get_feature_distribution");
    expect(getFeatureDistributionTool.input_schema.type).toBe("object");
    expect(getFeatureDistributionTool.input_schema.required).toBeUndefined();
    expect(getFeatureDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultFeatureDistributionRuntime integration -----

describe("defaultFeatureDistributionRuntime (integration)", () => {
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

  it("reads the real distribution through the default runtime", () => {
    const result =
      defaultFeatureDistributionRuntime.readDistribution() as FeatureDistribution;
    expect(result.features_total).toBe(7);
    expect(result.land_features).toBe(3);
    expect(result.water_features).toBe(4);
    expect(result.by_type[0].type).toBe("ocean");
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getFeatureDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.features_total).toBe(7);
    const byType = new Map<string, { count: number }>(
      body.by_type.map((e: { type: string; count: number }) => [
        e.type,
        { count: e.count },
      ]),
    );
    expect(byType.get("continent")?.count).toBe(2);
    expect(byType.get("ocean")?.count).toBe(3);
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFeatureDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getFeatureDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.features is missing -> tool surfaces error", async () => {
    globalsRef.pack = {} as unknown;
    expect(defaultFeatureDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
  });
});
