import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetRegimentDistributionTool,
  defaultRegimentDistributionRuntime,
  getRegimentDistributionTool,
  type RegimentDistribution,
  type RegimentDistributionPackLike,
  type RegimentDistributionRuntime,
  readRegimentDistributionFromPack,
  UNTYPED_REGIMENT_BUCKET,
} from "./get-regiment-distribution";

interface FakeRegiment {
  i: number;
  name?: string;
  type?: unknown;
  t?: unknown;
}

interface FakeState {
  i: number;
  name?: string;
  military?: Array<FakeRegiment | undefined | null>;
  removed?: boolean;
}

interface FakePack {
  states: Array<FakeState | undefined | null>;
}

function asPack(p: FakePack): RegimentDistributionPackLike {
  return p as unknown as RegimentDistributionPackLike;
}

function makePack(): FakePack {
  // States:
  //   0: Neutrals placeholder (skipped)
  //   1: active with 3 melee + 1 ranged + 1 Melee (case-preserved distinct)
  //   2: removed (skipped entirely)
  //   3: active with 2 fleet + 1 untyped (missing) + 1 untyped (empty)
  //   4: active with no military array
  //   5: active with empty military array
  //   6: active with a malformed regiment (no numeric i) plus one melee
  return {
    states: [
      { i: 0, name: "Neutrals" },
      {
        i: 1,
        name: "Alpha",
        military: [
          { i: 0, name: "A1", type: "melee", t: 1000 },
          { i: 1, name: "A2", type: "melee", t: 500 },
          { i: 2, name: "A3", type: "melee", t: 200 },
          { i: 3, name: "A4", type: "ranged", t: 300 },
          { i: 4, name: "A5", type: "Melee", t: 100 }, // case-preserved distinct
        ],
      },
      {
        i: 2,
        name: "Beta",
        removed: true,
        military: [{ i: 0, name: "B1", type: "melee", t: 9999 }],
      },
      {
        i: 3,
        name: "Gamma",
        military: [
          { i: 0, name: "G1", type: "fleet", t: 50 },
          { i: 1, name: "G2", type: "fleet", t: 80 },
          { i: 2, name: "G3", t: 20 }, // missing type → untyped
          { i: 3, name: "G4", type: "", t: 10 }, // empty → untyped
        ],
      },
      { i: 4, name: "Delta" }, // no military
      { i: 5, name: "Epsilon", military: [] },
      {
        i: 6,
        name: "Zeta",
        military: [
          null,
          undefined,
          { i: "bad" as unknown as number, name: "bad", type: "melee", t: 5 },
          { i: 0, name: "Z1", type: "melee", t: 75 },
        ],
      },
    ],
  };
}

function runtimeReturning(
  result: RegimentDistribution | "not-ready",
): RegimentDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(): RegimentDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () => readRegimentDistributionFromPack(pack),
  };
}

describe("get_regiment_distribution — pure aggregator", () => {
  it("skips the index-0 Neutrals placeholder", () => {
    const result = readRegimentDistributionFromPack(
      asPack({
        states: [
          {
            i: 0,
            name: "Neutrals",
            military: [{ i: 0, type: "melee", t: 5000 }],
          },
          {
            i: 1,
            name: "A",
            military: [{ i: 0, type: "melee", t: 10 }],
          },
        ],
      }),
    ) as RegimentDistribution;
    expect(result.total_regiments).toBe(1);
    expect(result.total_soldiers).toBe(10);
  });

  it("skips removed states entirely", () => {
    const result = readRegimentDistributionFromPack(
      asPack(makePack()),
    ) as RegimentDistribution;
    // Beta (removed) contained 1 regiment with 9999 soldiers → excluded
    const beta = result.by_type.find((e) => e.soldiers === 9999);
    expect(beta).toBeUndefined();
  });

  it("skips states without a military array or with an empty one", () => {
    const result = readRegimentDistributionFromPack(
      asPack({
        states: [
          { i: 0, name: "N" },
          { i: 1, name: "A" },
          { i: 2, name: "B", military: [] },
        ],
      }),
    ) as RegimentDistribution;
    expect(result.total_regiments).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("skips falsy and malformed regiment entries (missing numeric i)", () => {
    const result = readRegimentDistributionFromPack(
      asPack({
        states: [
          { i: 0 },
          {
            i: 1,
            name: "A",
            military: [
              null,
              undefined,
              { i: "x" as unknown as number, type: "melee", t: 1000 },
              { i: 0, type: "melee", t: 10 },
            ],
          },
        ],
      }),
    ) as RegimentDistribution;
    expect(result.total_regiments).toBe(1);
    expect(result.total_soldiers).toBe(10);
  });

  it("groups by exact `regiment.type` string (preserves casing)", () => {
    const result = readRegimentDistributionFromPack(
      asPack(makePack()),
    ) as RegimentDistribution;
    const types = new Map(result.by_type.map((e) => [e.type, e]));
    // State 1 has 3 "melee" + 1 "Melee" (case-preserved distinct)
    // State 6 has 1 "melee" (the malformed one is skipped)
    expect(types.get("melee")?.count).toBe(4);
    expect(types.get("Melee")?.count).toBe(1);
    expect(types.get("ranged")?.count).toBe(1);
    expect(types.get("fleet")?.count).toBe(2);
  });

  it("buckets missing / non-string / empty / whitespace types under 'untyped'", () => {
    const result = readRegimentDistributionFromPack(
      asPack({
        states: [
          { i: 0 },
          {
            i: 1,
            name: "A",
            military: [
              { i: 0, t: 1 }, // missing
              { i: 1, type: "" as unknown as string, t: 2 }, // empty
              { i: 2, type: "   " as unknown as string, t: 3 }, // whitespace
              { i: 3, type: 42 as unknown as string, t: 4 }, // non-string
            ],
          },
        ],
      }),
    ) as RegimentDistribution;
    expect(result.total_regiments).toBe(4);
    expect(result.by_type).toEqual([
      {
        type: UNTYPED_REGIMENT_BUCKET,
        count: 4,
        soldiers: 10,
        percentage: 100,
      },
    ]);
  });

  it("sums `soldiers` from `regiment.t` and coerces missing / non-finite / negative to 0", () => {
    const result = readRegimentDistributionFromPack(
      asPack({
        states: [
          { i: 0 },
          {
            i: 1,
            name: "A",
            military: [
              { i: 0, type: "melee", t: 100 },
              { i: 1, type: "melee" }, // missing t
              { i: 2, type: "melee", t: Number.NaN },
              { i: 3, type: "melee", t: -50 }, // negative → 0
              { i: 4, type: "melee", t: 50 },
            ],
          },
        ],
      }),
    ) as RegimentDistribution;
    const melee = result.by_type.find((e) => e.type === "melee");
    expect(melee?.count).toBe(5);
    expect(melee?.soldiers).toBe(150);
    expect(result.total_soldiers).toBe(150);
  });

  it("computes percentage as count / total_regiments * 100 and sums to ~100", () => {
    const result = readRegimentDistributionFromPack(
      asPack(makePack()),
    ) as RegimentDistribution;
    // total = 4(melee) + 1(Melee) + 1(ranged) + 2(fleet) + 2(untyped) = 10
    expect(result.total_regiments).toBe(10);
    const byType = new Map(result.by_type.map((e) => [e.type, e.percentage]));
    expect(byType.get("melee")).toBeCloseTo(40);
    expect(byType.get("fleet")).toBeCloseTo(20);
    expect(byType.get(UNTYPED_REGIMENT_BUCKET)).toBeCloseTo(20);
    expect(byType.get("Melee")).toBeCloseTo(10);
    expect(byType.get("ranged")).toBeCloseTo(10);
    const sum = result.by_type.reduce((acc, e) => acc + e.percentage, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("sorts by_type by count desc, ties broken by type asc (case-sensitive)", () => {
    const result = readRegimentDistributionFromPack(
      asPack({
        states: [
          { i: 0 },
          {
            i: 1,
            name: "A",
            military: [
              { i: 0, type: "Charlie", t: 1 },
              { i: 1, type: "Charlie", t: 1 },
              { i: 2, type: "Alpha", t: 1 },
              { i: 3, type: "Alpha", t: 1 },
              { i: 4, type: "Bravo", t: 1 },
              { i: 5, type: "Bravo", t: 1 },
            ],
          },
        ],
      }),
    ) as RegimentDistribution;
    expect(result.by_type.map((e) => e.type)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("returns zero totals / empty by_type when no active regiments exist", () => {
    const result = readRegimentDistributionFromPack(
      asPack({
        states: [
          { i: 0, name: "Neutrals" },
          { i: 1, name: "A" }, // no military
          { i: 2, name: "B", military: [] },
        ],
      }),
    ) as RegimentDistribution;
    expect(result.total_regiments).toBe(0);
    expect(result.total_soldiers).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("tolerates null / undefined entries in the states array", () => {
    const pack = {
      states: [
        null,
        undefined,
        { i: 0 },
        {
          i: 1,
          name: "A",
          military: [{ i: 0, type: "melee", t: 5 }],
        },
      ],
    } as unknown as RegimentDistributionPackLike;
    const result = readRegimentDistributionFromPack(
      pack,
    ) as RegimentDistribution;
    expect(result.total_regiments).toBe(1);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readRegimentDistributionFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as RegimentDistributionPackLike;
    expect(readRegimentDistributionFromPack(pack)).toBe("not-ready");
  });
});

describe("get_regiment_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetRegimentDistributionTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_regiments).toBe(10);
    expect(Array.isArray(body.by_type)).toBe(true);
    expect(body.by_type[0].type).toBe("melee");
    expect(body.by_type[0].count).toBe(4);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetRegimentDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("tolerates null / undefined input", async () => {
    const tool = createGetRegimentDistributionTool(realRuntime());
    expect((await tool.execute(null)).isError).toBeFalsy();
    expect((await tool.execute(undefined)).isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetRegimentDistributionTool(
      runtimeReturning("not-ready"),
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getRegimentDistributionTool with the expected schema", () => {
    expect(getRegimentDistributionTool.name).toBe("get_regiment_distribution");
    expect(getRegimentDistributionTool.input_schema.type).toBe("object");
    expect(getRegimentDistributionTool.input_schema.required).toBeUndefined();
    expect(getRegimentDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultRegimentDistributionRuntime integration -----

describe("defaultRegimentDistributionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads the real distribution through the default runtime", () => {
    const result =
      defaultRegimentDistributionRuntime.readDistribution() as RegimentDistribution;
    expect(result.total_regiments).toBe(10);
    const melee = result.by_type.find((e) => e.type === "melee");
    expect(melee?.count).toBe(4);
    // melee soldiers = 1000 + 500 + 200 + 75 = 1775
    expect(melee?.soldiers).toBe(1775);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getRegimentDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_regiments).toBe(10);
    const byType = new Map<string, { count: number; soldiers: number }>(
      body.by_type.map(
        (e: { type: string; count: number; soldiers: number }) => [
          e.type,
          { count: e.count, soldiers: e.soldiers },
        ],
      ),
    );
    expect(byType.get("fleet")?.count).toBe(2);
    expect(byType.get("fleet")?.soldiers).toBe(130);
    expect(byType.get(UNTYPED_REGIMENT_BUCKET)?.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultRegimentDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getRegimentDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.states is missing → tool surfaces error", () => {
    globalsRef.pack = {} as unknown;
    expect(defaultRegimentDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
  });
});
