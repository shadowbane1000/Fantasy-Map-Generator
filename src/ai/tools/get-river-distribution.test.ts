import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetRiverDistributionTool,
  defaultRiverDistributionRuntime,
  getRiverDistributionTool,
  type RiverDistribution,
  type RiverDistributionPackLike,
  type RiverDistributionRuntime,
  readRiverDistributionFromPack,
} from "./get-river-distribution";

interface FakeRiver {
  i: number;
  name?: string;
  type?: string | null | number;
  length?: number;
  removed?: boolean;
}

interface FakePack {
  rivers: Array<FakeRiver | 0 | undefined | null>;
}

function makePack(): FakePack {
  // Slots (by array index):
  //   0 → placeholder 0 (generator writes 0 here; must be skipped)
  //   1 → River     i=1 length 500
  //   2 → River     i=2 length 300
  //   3 → Stream    i=3 length 120
  //   4 → Stream    i=4 length 90
  //   5 → Stream    i=5 length 60
  //   6 → Creek     i=6 length 30
  //   7 → removed   i=7 (removed:true) → filtered
  //   8 → (no type) i=8 length 10 → "unknown"
  //   9 → (empty)   i=9 type:"" length 20 → "unknown"
  //  10 → (non-str) i=10 type: 42 length 40 → "unknown"
  //  11 → undefined slot → filtered
  //  12 → null slot → filtered
  //  13 → NaN len  i=13 type:"River" length NaN → length coerced to 0
  //  14 → i=0 entry (id-0 placeholder guard) → filtered
  return {
    rivers: [
      0,
      { i: 1, name: "Alpha", type: "River", length: 500 },
      { i: 2, name: "Beta", type: "River", length: 300 },
      { i: 3, name: "Gamma", type: "Stream", length: 120 },
      { i: 4, name: "Delta", type: "Stream", length: 90 },
      { i: 5, name: "Epsilon", type: "Stream", length: 60 },
      { i: 6, name: "Zeta", type: "Creek", length: 30 },
      { i: 7, name: "Gone", type: "River", length: 9999, removed: true },
      { i: 8, name: "NoType", length: 10 },
      { i: 9, name: "EmptyType", type: "", length: 20 },
      { i: 10, name: "NumberType", type: 42 as unknown as string, length: 40 },
      undefined,
      null,
      { i: 13, name: "NaNLen", type: "River", length: Number.NaN },
      { i: 0, name: "IdZero", type: "River", length: 99999 },
    ],
  };
}

function asPack(p: FakePack): RiverDistributionPackLike {
  return p as unknown as RiverDistributionPackLike;
}

function runtimeReturning(
  result: RiverDistribution | "not-ready",
): RiverDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(): RiverDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () => readRiverDistributionFromPack(pack),
  };
}

describe("get_river_distribution — pure aggregator", () => {
  it("skips the index-0 placeholder and id-0 entries and falsy slots", () => {
    const result = readRiverDistributionFromPack(
      asPack(makePack()),
    ) as RiverDistribution;
    // Active: i = 1, 2, 3, 4, 5, 6, 8, 9, 10, 13 → 10 rivers
    expect(result.total_rivers).toBe(10);
  });

  it("skips removed rivers", () => {
    const result = readRiverDistributionFromPack(
      asPack(makePack()),
    ) as RiverDistribution;
    const river = result.by_type.find((e) => e.type === "River");
    // Actives with type "River": i=1 (500), i=2 (300), i=13 (NaN→0) → count 3
    // (removed i=7 is excluded)
    expect(river?.count).toBe(3);
  });

  it("buckets by river.type and aggregates count + length", () => {
    const result = readRiverDistributionFromPack(
      asPack(makePack()),
    ) as RiverDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    expect(byType.get("River")).toMatchObject({ count: 3, length: 800 });
    expect(byType.get("Stream")).toMatchObject({ count: 3, length: 270 });
    expect(byType.get("Creek")).toMatchObject({ count: 1, length: 30 });
  });

  it("classifies missing / empty / non-string type as 'unknown'", () => {
    const result = readRiverDistributionFromPack(
      asPack(makePack()),
    ) as RiverDistribution;
    const unknown = result.by_type.find((e) => e.type === "unknown");
    // i=8 (10), i=9 (20), i=10 (40) → count 3, length 70
    expect(unknown).toMatchObject({ count: 3, length: 70 });
  });

  it("computes percentage as count / total_rivers * 100", () => {
    const result = readRiverDistributionFromPack(
      asPack(makePack()),
    ) as RiverDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e.percentage]));
    // total_rivers = 10
    expect(byType.get("River")).toBeCloseTo((3 / 10) * 100);
    expect(byType.get("Stream")).toBeCloseTo((3 / 10) * 100);
    expect(byType.get("unknown")).toBeCloseTo((3 / 10) * 100);
    expect(byType.get("Creek")).toBeCloseTo((1 / 10) * 100);
    const sum = result.by_type.reduce((acc, e) => acc + e.percentage, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("sorts by_type by count desc, ties broken by type asc", () => {
    const result = readRiverDistributionFromPack(
      asPack(makePack()),
    ) as RiverDistribution;
    // counts: River 3, Stream 3, unknown 3, Creek 1
    // ties at count=3 → alphabetical asc: River, Stream, unknown
    expect(result.by_type.map((e) => e.type)).toEqual([
      "River",
      "Stream",
      "unknown",
      "Creek",
    ]);
  });

  it("coerces missing / non-finite length to 0", () => {
    const pack = {
      rivers: [
        0,
        { i: 1, type: "River" }, // missing length
        { i: 2, type: "River", length: Number.NaN },
        { i: 3, type: "River", length: Number.POSITIVE_INFINITY },
        { i: 4, type: "River", length: "nope" as unknown as number },
      ],
    } as unknown as RiverDistributionPackLike;
    const result = readRiverDistributionFromPack(pack) as RiverDistribution;
    const river = result.by_type.find((e) => e.type === "River");
    expect(river).toMatchObject({ count: 4, length: 0 });
    expect(result.total_length).toBe(0);
  });

  it("sums total_length across active rivers", () => {
    const result = readRiverDistributionFromPack(
      asPack(makePack()),
    ) as RiverDistribution;
    // Lengths: 500 + 300 + 120 + 90 + 60 + 30 + 10 + 20 + 40 + 0 (NaN) = 1170
    expect(result.total_length).toBe(1170);
  });

  it("returns zero totals and empty by_type for a placeholder-only pack", () => {
    const pack = {
      rivers: [0],
    } as unknown as RiverDistributionPackLike;
    const result = readRiverDistributionFromPack(pack) as RiverDistribution;
    expect(result.total_rivers).toBe(0);
    expect(result.total_length).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("treats all-falsy slots and removed-only pack as empty", () => {
    const pack = {
      rivers: [
        0,
        undefined,
        null,
        { i: 1, type: "River", length: 5, removed: true },
      ],
    } as unknown as RiverDistributionPackLike;
    const result = readRiverDistributionFromPack(pack) as RiverDistribution;
    expect(result.total_rivers).toBe(0);
    expect(result.total_length).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readRiverDistributionFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.rivers is missing", () => {
    const pack = {} as RiverDistributionPackLike;
    expect(readRiverDistributionFromPack(pack)).toBe("not-ready");
  });
});

describe("get_river_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetRiverDistributionTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_rivers).toBe(10);
    expect(body.total_length).toBe(1170);
    expect(Array.isArray(body.by_type)).toBe(true);
    expect(body.by_type[0].type).toBe("River");
    expect(body.by_type[0].count).toBe(3);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetRiverDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("tolerates null / undefined input", async () => {
    const tool = createGetRiverDistributionTool(realRuntime());
    expect((await tool.execute(null)).isError).toBeFalsy();
    expect((await tool.execute(undefined)).isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetRiverDistributionTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getRiverDistributionTool with the expected schema", () => {
    expect(getRiverDistributionTool.name).toBe("get_river_distribution");
    expect(getRiverDistributionTool.input_schema.type).toBe("object");
    expect(getRiverDistributionTool.input_schema.required).toBeUndefined();
    expect(getRiverDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultRiverDistributionRuntime integration -----

describe("defaultRiverDistributionRuntime (integration)", () => {
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
      defaultRiverDistributionRuntime.readDistribution() as RiverDistribution;
    expect(result.total_rivers).toBe(10);
    expect(result.total_length).toBe(1170);
    expect(result.by_type[0].type).toBe("River");
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getRiverDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_rivers).toBe(10);
    const byType = new Map<string, { count: number; length: number }>(
      body.by_type.map((e: { type: string; count: number; length: number }) => [
        e.type,
        { count: e.count, length: e.length },
      ]),
    );
    expect(byType.get("River")).toEqual({ count: 3, length: 800 });
    expect(byType.get("Stream")).toEqual({ count: 3, length: 270 });
    expect(byType.get("Creek")).toEqual({ count: 1, length: 30 });
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultRiverDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getRiverDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.rivers is missing -> tool surfaces error", async () => {
    globalsRef.pack = {} as unknown;
    expect(defaultRiverDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
  });
});
