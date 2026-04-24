import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetRouteDistributionTool,
  defaultRouteDistributionRuntime,
  getRouteDistributionTool,
  type RouteDistribution,
  type RouteDistributionPackLike,
  type RouteDistributionRuntime,
  readRouteDistributionFromPack,
} from "./get-route-distribution";

interface FakeRoute {
  i: number;
  name?: string;
  group?: string | null | number;
  points?: unknown[];
  removed?: boolean;
}

interface FakePack {
  routes: Array<FakeRoute | undefined | null>;
}

function makePack(): FakePack {
  // Slots (by array index):
  //   0 → roads   i=0 (NOT a placeholder — routes have no id-0 slot) 3 points
  //   1 → roads   i=1 name King's Road 5 points
  //   2 → roads   i=2 2 points
  //   3 → trails  i=3 Silk Trail 4 points
  //   4 → trails  i=4 1 point
  //   5 → trails  i=5 6 points
  //   6 → searoutes i=6 North Passage 7 points
  //   7 → removed i=7 (removed:true) → filtered
  //   8 → (no group) i=8 length 10 → "unknown"
  //   9 → (empty)   i=9 group:"" 2 points → "unknown"
  //  10 → (non-str) i=10 group: 42 3 points → "unknown"
  //  11 → undefined slot → filtered
  //  12 → null slot → filtered
  //  13 → roads    i=13 no points array
  //  14 → roads    i=14 non-array points
  return {
    routes: [
      {
        i: 0,
        group: "roads",
        points: [
          [0, 0, 1],
          [1, 1, 2],
          [2, 2, 3],
        ],
      },
      {
        i: 1,
        group: "roads",
        name: "King's Road",
        points: [
          [0, 0, 1],
          [1, 1, 2],
          [2, 2, 3],
          [3, 3, 4],
          [4, 4, 5],
        ],
      },
      {
        i: 2,
        group: "roads",
        points: [
          [0, 0, 1],
          [1, 1, 2],
        ],
      },
      {
        i: 3,
        group: "trails",
        name: "Silk Trail",
        points: [
          [0, 0, 1],
          [1, 1, 2],
          [2, 2, 3],
          [3, 3, 4],
        ],
      },
      {
        i: 4,
        group: "trails",
        points: [[0, 0, 1]],
      },
      {
        i: 5,
        group: "trails",
        points: [
          [0, 0, 1],
          [1, 1, 2],
          [2, 2, 3],
          [3, 3, 4],
          [4, 4, 5],
          [5, 5, 6],
        ],
      },
      {
        i: 6,
        group: "searoutes",
        name: "North Passage",
        points: [
          [0, 0, 1],
          [1, 1, 2],
          [2, 2, 3],
          [3, 3, 4],
          [4, 4, 5],
          [5, 5, 6],
          [6, 6, 7],
        ],
      },
      {
        i: 7,
        group: "searoutes",
        name: "Ghost Lane",
        points: [
          [0, 0, 1],
          [1, 1, 2],
          [2, 2, 3],
          [3, 3, 4],
          [4, 4, 5],
          [5, 5, 6],
          [6, 6, 7],
          [7, 7, 8],
          [8, 8, 9],
          [9, 9, 10],
        ],
        removed: true,
      },
      { i: 8, points: [[0, 0, 1]] },
      {
        i: 9,
        group: "",
        points: [
          [0, 0, 1],
          [1, 1, 2],
        ],
      },
      {
        i: 10,
        group: 42 as unknown as string,
        points: [
          [0, 0, 1],
          [1, 1, 2],
          [2, 2, 3],
        ],
      },
      undefined,
      null,
      { i: 13, group: "roads" },
      { i: 14, group: "roads", points: "nope" as unknown as unknown[] },
    ],
  };
}

function asPack(p: FakePack): RouteDistributionPackLike {
  return p as unknown as RouteDistributionPackLike;
}

function runtimeReturning(
  result: RouteDistribution | "not-ready",
): RouteDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(): RouteDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () => readRouteDistributionFromPack(pack),
  };
}

describe("get_route_distribution — pure aggregator", () => {
  it("includes id-0 routes and skips falsy slots", () => {
    const result = readRouteDistributionFromPack(
      asPack(makePack()),
    ) as RouteDistribution;
    // Active: i = 0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 13, 14 → 12 routes
    // (removed i=7 excluded; undefined / null slots filtered)
    expect(result.total_routes).toBe(12);
  });

  it("skips removed routes", () => {
    const result = readRouteDistributionFromPack(
      asPack(makePack()),
    ) as RouteDistribution;
    const sea = result.by_group.find((e) => e.group === "searoutes");
    // Actives with group "searoutes": i=6 only (i=7 removed)
    expect(sea?.count).toBe(1);
  });

  it("buckets by route.group and aggregates count + points", () => {
    const result = readRouteDistributionFromPack(
      asPack(makePack()),
    ) as RouteDistribution;
    const byGroup = new Map(result.by_group.map((e) => [e.group, e]));
    // roads: i=0 (3) + i=1 (5) + i=2 (2) + i=13 (0) + i=14 (0) → count 5, points 10
    expect(byGroup.get("roads")).toMatchObject({ count: 5, points: 10 });
    // trails: i=3 (4) + i=4 (1) + i=5 (6) → count 3, points 11
    expect(byGroup.get("trails")).toMatchObject({ count: 3, points: 11 });
    // searoutes: i=6 (7) → count 1, points 7
    expect(byGroup.get("searoutes")).toMatchObject({ count: 1, points: 7 });
  });

  it("classifies missing / empty / non-string group as 'unknown'", () => {
    const result = readRouteDistributionFromPack(
      asPack(makePack()),
    ) as RouteDistribution;
    const unknown = result.by_group.find((e) => e.group === "unknown");
    // i=8 (1) + i=9 (2) + i=10 (3) → count 3, points 6
    expect(unknown).toMatchObject({ count: 3, points: 6 });
  });

  it("computes percentage as count / total_routes * 100", () => {
    const result = readRouteDistributionFromPack(
      asPack(makePack()),
    ) as RouteDistribution;
    const byGroup = new Map(
      result.by_group.map((e) => [e.group, e.percentage]),
    );
    // total_routes = 12
    expect(byGroup.get("roads")).toBeCloseTo((5 / 12) * 100);
    expect(byGroup.get("trails")).toBeCloseTo((3 / 12) * 100);
    expect(byGroup.get("unknown")).toBeCloseTo((3 / 12) * 100);
    expect(byGroup.get("searoutes")).toBeCloseTo((1 / 12) * 100);
    const sum = result.by_group.reduce((acc, e) => acc + e.percentage, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("sorts by_group by count desc, ties broken by group asc", () => {
    const result = readRouteDistributionFromPack(
      asPack(makePack()),
    ) as RouteDistribution;
    // counts: roads 5, trails 3, unknown 3, searoutes 1
    // ties at count=3 → alphabetical asc: trails, unknown
    expect(result.by_group.map((e) => e.group)).toEqual([
      "roads",
      "trails",
      "unknown",
      "searoutes",
    ]);
  });

  it("coerces missing / non-array points to 0", () => {
    const pack = {
      routes: [
        { i: 1, group: "roads" }, // missing points
        { i: 2, group: "roads", points: null as unknown as unknown[] },
        { i: 3, group: "roads", points: "nope" as unknown as unknown[] },
        { i: 4, group: "roads", points: 42 as unknown as unknown[] },
      ],
    } as unknown as RouteDistributionPackLike;
    const result = readRouteDistributionFromPack(pack) as RouteDistribution;
    const roads = result.by_group.find((e) => e.group === "roads");
    expect(roads).toMatchObject({ count: 4, points: 0 });
    expect(result.total_points).toBe(0);
  });

  it("sums total_points across active routes", () => {
    const result = readRouteDistributionFromPack(
      asPack(makePack()),
    ) as RouteDistribution;
    // Points: 3 + 5 + 2 + 4 + 1 + 6 + 7 + 1 + 2 + 3 + 0 + 0 = 34
    expect(result.total_points).toBe(34);
  });

  it("returns zero totals and empty by_group for an empty routes pack", () => {
    const pack = {
      routes: [],
    } as unknown as RouteDistributionPackLike;
    const result = readRouteDistributionFromPack(pack) as RouteDistribution;
    expect(result.total_routes).toBe(0);
    expect(result.total_points).toBe(0);
    expect(result.by_group).toEqual([]);
  });

  it("treats all-falsy slots and removed-only pack as empty", () => {
    const pack = {
      routes: [
        undefined,
        null,
        {
          i: 1,
          group: "roads",
          points: [
            [0, 0, 1],
            [1, 1, 2],
          ],
          removed: true,
        },
      ],
    } as unknown as RouteDistributionPackLike;
    const result = readRouteDistributionFromPack(pack) as RouteDistribution;
    expect(result.total_routes).toBe(0);
    expect(result.total_points).toBe(0);
    expect(result.by_group).toEqual([]);
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readRouteDistributionFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.routes is missing", () => {
    const pack = {} as RouteDistributionPackLike;
    expect(readRouteDistributionFromPack(pack)).toBe("not-ready");
  });
});

describe("get_route_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetRouteDistributionTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_routes).toBe(12);
    expect(body.total_points).toBe(34);
    expect(Array.isArray(body.by_group)).toBe(true);
    expect(body.by_group[0].group).toBe("roads");
    expect(body.by_group[0].count).toBe(5);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetRouteDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("tolerates null / undefined input", async () => {
    const tool = createGetRouteDistributionTool(realRuntime());
    expect((await tool.execute(null)).isError).toBeFalsy();
    expect((await tool.execute(undefined)).isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetRouteDistributionTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getRouteDistributionTool with the expected schema", () => {
    expect(getRouteDistributionTool.name).toBe("get_route_distribution");
    expect(getRouteDistributionTool.input_schema.type).toBe("object");
    expect(getRouteDistributionTool.input_schema.required).toBeUndefined();
    expect(getRouteDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultRouteDistributionRuntime integration -----

describe("defaultRouteDistributionRuntime (integration)", () => {
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
      defaultRouteDistributionRuntime.readDistribution() as RouteDistribution;
    expect(result.total_routes).toBe(12);
    expect(result.total_points).toBe(34);
    expect(result.by_group[0].group).toBe("roads");
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getRouteDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_routes).toBe(12);
    const byGroup = new Map<string, { count: number; points: number }>(
      body.by_group.map(
        (e: { group: string; count: number; points: number }) => [
          e.group,
          { count: e.count, points: e.points },
        ],
      ),
    );
    expect(byGroup.get("roads")).toEqual({ count: 5, points: 10 });
    expect(byGroup.get("trails")).toEqual({ count: 3, points: 11 });
    expect(byGroup.get("searoutes")).toEqual({ count: 1, points: 7 });
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultRouteDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getRouteDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.routes is missing -> tool surfaces error", async () => {
    globalsRef.pack = {} as unknown;
    expect(defaultRouteDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
  });
});
