import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawRoute } from "./_shared";
import {
  createFindRoutesByGroupTool,
  DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT,
  defaultFindRoutesByGroupRuntime,
  type FindRoutesByGroupResult,
  type FindRoutesByGroupRuntime,
  findRoutesByGroupInPack,
  findRoutesByGroupTool,
  MAX_FIND_ROUTES_BY_GROUP_LIMIT,
} from "./find-routes-by-group";
import { ROUTE_GROUPS } from "./list-routes";

interface FakePack {
  routes: Array<RawRoute | null | undefined>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findRoutesByGroupInPack>[0];
}

function makePack(): FakePack {
  // i=1: roads, King's Road, feature 3, 5 points
  // i=2: roads (uppercase "Roads" — case-insensitive compare), no name, feature missing
  // i=3: trails, no points, feature 7
  // i=4: trails, Silk Trail, 2 points
  // i=5: searoutes, North Passage, 4 points
  // i=6: searoutes, removed=true (skipped)
  // i=7: roads, non-string name, null feature, malformed points
  // i=8: missing group (skipped)
  // i=9: null slot (tolerated)
  return {
    routes: [
      {
        i: 1,
        group: "roads",
        name: "King's Road",
        feature: 3,
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
        group: "Roads",
      },
      {
        i: 3,
        group: "trails",
        name: "",
        feature: 7,
      },
      {
        i: 4,
        group: "trails",
        name: "Silk Trail",
        points: [
          [10, 10, 50],
          [11, 11, 51],
        ],
      },
      {
        i: 5,
        group: "searoutes",
        name: "North Passage",
        feature: 11,
        points: [
          [100, 100, 500],
          [101, 101, 501],
          [102, 102, 502],
          [103, 103, 503],
        ],
      },
      {
        i: 6,
        group: "searoutes",
        name: "Ghost Lane",
        removed: true,
      },
      {
        i: 7,
        group: "roads",
        name: 42 as unknown as string,
        feature: "bad" as unknown as number,
        points: "nope" as unknown as unknown[],
      },
      { i: 8, name: "No group route" },
      null as unknown as RawRoute,
    ],
  };
}

function runtimeReturning(
  result: FindRoutesByGroupResult,
): FindRoutesByGroupRuntime {
  return { find: () => result };
}

describe("find_routes_by_group — pure scanner", () => {
  it("matches routes by canonical group (roads)", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "roads",
      limit: 100,
    }) as {
      group: string;
      routes: Array<{ i: number }>;
      count: number;
    };
    const ids = new Set(result.routes.map((r) => r.i));
    // 1, 2 (case-insensitive "Roads"), 7
    expect(ids).toEqual(new Set([1, 2, 7]));
    expect(result.count).toBe(3);
    expect(result.group).toBe("roads");
  });

  it("matches routes by trails group", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "trails",
      limit: 100,
    }) as { routes: Array<{ i: number }>; count: number };
    const ids = new Set(result.routes.map((r) => r.i));
    expect(ids).toEqual(new Set([3, 4]));
    expect(result.count).toBe(2);
  });

  it("matches routes by searoutes group (skips removed)", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "searoutes",
      limit: 100,
    }) as { routes: Array<{ i: number }>; count: number };
    const ids = new Set(result.routes.map((r) => r.i));
    // 5 only; 6 is removed
    expect(ids).toEqual(new Set([5]));
    expect(result.count).toBe(1);
  });

  it("skips removed routes and null slots", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "searoutes",
      limit: 100,
    }) as { routes: Array<{ i: number }> };
    const ids = new Set(result.routes.map((r) => r.i));
    expect(ids.has(6)).toBe(false);
  });

  it("emits points_count=0 for missing or non-array points", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "roads",
      limit: 100,
    }) as { routes: Array<{ i: number; points_count: number }> };
    const byId = new Map(result.routes.map((r) => [r.i, r.points_count]));
    expect(byId.get(1)).toBe(5);
    expect(byId.get(2)).toBe(0); // no points
    expect(byId.get(7)).toBe(0); // non-array points
  });

  it("emits feature=null for missing / non-number feature", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "roads",
      limit: 100,
    }) as { routes: Array<{ i: number; feature: number | null }> };
    const byId = new Map(result.routes.map((r) => [r.i, r.feature]));
    expect(byId.get(1)).toBe(3);
    expect(byId.get(2)).toBeNull(); // missing feature
    expect(byId.get(7)).toBeNull(); // non-number feature
  });

  it("emits name=null for missing / non-string name", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "roads",
      limit: 100,
    }) as { routes: Array<{ i: number; name: string | null }> };
    const byId = new Map(result.routes.map((r) => [r.i, r.name]));
    expect(byId.get(1)).toBe("King's Road");
    expect(byId.get(2)).toBeNull();
    expect(byId.get(7)).toBeNull();
  });

  it("returns canonical group in payload even if source route group was cased", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "roads",
      limit: 100,
    }) as { group: string; routes: Array<{ group: string }> };
    expect(result.group).toBe("roads");
    for (const r of result.routes) expect(r.group).toBe("roads");
  });

  it("limit truncates routes but count reports the full total", () => {
    const result = findRoutesByGroupInPack(asPack(makePack()), {
      group: "roads",
      limit: 1,
    }) as { routes: Array<{ i: number }>; count: number };
    expect(result.routes.length).toBe(1);
    expect(result.count).toBe(3);
  });

  it("returns empty routes and count 0 for a group with no matches", () => {
    const empty: FakePack = {
      routes: [{ i: 1, group: "roads" }],
    };
    const result = findRoutesByGroupInPack(asPack(empty), {
      group: "searoutes",
      limit: 100,
    }) as { group: string; routes: unknown[]; count: number };
    expect(result.routes).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.group).toBe("searoutes");
  });

  it("returns 'not-ready' when pack is undefined", () => {
    expect(
      findRoutesByGroupInPack(undefined, {
        group: "roads",
        limit: 100,
      }),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.routes is missing", () => {
    expect(
      findRoutesByGroupInPack(
        {} as unknown as Parameters<typeof findRoutesByGroupInPack>[0],
        { group: "roads", limit: 100 },
      ),
    ).toBe("not-ready");
  });
});

describe("find_routes_by_group — tool surface", () => {
  function realRuntime(): FindRoutesByGroupRuntime {
    const pack = asPack(makePack());
    return { find: (q) => findRoutesByGroupInPack(pack, q) };
  }

  it("rejects missing group", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/group is required/i);
    expect(body.supported).toEqual([...ROUTE_GROUPS]);
  });

  it("rejects non-string group", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    for (const bad of [{ group: 42 }, { group: true }, { group: [] }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      const body = JSON.parse(r.content);
      expect(body.error).toMatch(/must be a string/i);
      expect(body.supported).toEqual([...ROUTE_GROUPS]);
    }
  });

  it("rejects empty / whitespace group", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    for (const input of [{ group: "" }, { group: "   " }, { group: "\t\n" }]) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
      const body = JSON.parse(r.content);
      expect(body.error).toMatch(/non-empty|required/i);
      expect(body.supported).toEqual([...ROUTE_GROUPS]);
    }
  });

  it("rejects unknown group", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    const r = await tool.execute({ group: "highways" });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/unknown route group/i);
    expect(body.supported).toEqual([...ROUTE_GROUPS]);
  });

  it("accepts canonical groups and echoes canonical", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    for (const g of ROUTE_GROUPS) {
      const r = await tool.execute({ group: g });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.ok).toBe(true);
      expect(body.group).toBe(g);
    }
  });

  it("accepts aliases and returns canonical group", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    const cases: Array<{ input: string; expected: string }> = [
      { input: "road", expected: "roads" },
      { input: "ROAD", expected: "roads" },
      { input: "trail", expected: "trails" },
      { input: "TRAIL", expected: "trails" },
      { input: "sea lanes", expected: "searoutes" },
      { input: "sea-routes", expected: "searoutes" },
      { input: "sealane", expected: "searoutes" },
    ];
    for (const { input, expected } of cases) {
      const r = await tool.execute({ group: input });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.ok).toBe(true);
      expect(body.group).toBe(expected);
    }
  });

  it("rejects out-of-range / non-integer / NaN limit", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    for (const bad of [
      { group: "roads", limit: 0 },
      { group: "roads", limit: MAX_FIND_ROUTES_BY_GROUP_LIMIT + 1 },
      { group: "roads", limit: 1.5 },
      { group: "roads", limit: "10" },
      { group: "roads", limit: -1 },
      { group: "roads", limit: Number.NaN },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/i);
    }
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    const r1 = await tool.execute({ group: "roads", limit: 1 });
    expect(r1.isError).toBeFalsy();
    const b1 = JSON.parse(r1.content);
    expect(b1.routes.length).toBe(1);
    expect(b1.count).toBe(3);
    const r2 = await tool.execute({
      group: "roads",
      limit: MAX_FIND_ROUTES_BY_GROUP_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).routes.length).toBe(3);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindRoutesByGroupTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ group: "roads" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns ok payload for trails", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    const result = await tool.execute({ group: "trails" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.group).toBe("trails");
    expect(new Set(body.routes.map((r: { i: number }) => r.i))).toEqual(
      new Set([3, 4]),
    );
    expect(body.count).toBe(2);
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindRoutesByGroupTool(realRuntime());
    const result = await tool.execute({ group: "roads", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.routes.length).toBe(2);
    expect(body.count).toBe(3);
  });

  it("is exported as findRoutesByGroupTool with the expected schema", () => {
    expect(findRoutesByGroupTool.name).toBe("find_routes_by_group");
    expect(findRoutesByGroupTool.input_schema.type).toBe("object");
    expect(findRoutesByGroupTool.input_schema.required).toEqual(["group"]);
    expect(findRoutesByGroupTool.input_schema.properties.group).toBeDefined();
    expect(findRoutesByGroupTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_ROUTES_BY_GROUP_LIMIT).toBe(10000);
    expect(MAX_FIND_ROUTES_BY_GROUP_LIMIT).toBe(100000);
  });
});

// ----- defaultFindRoutesByGroupRuntime integration -----

describe("defaultFindRoutesByGroupRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads the real pack via default runtime for a roads query", () => {
    const result = defaultFindRoutesByGroupRuntime.find({
      group: "roads",
      limit: 100,
    }) as { routes: Array<{ i: number }>; count: number };
    expect(new Set(result.routes.map((r) => r.i))).toEqual(new Set([1, 2, 7]));
    expect(result.count).toBe(3);
  });

  it("reads the real pack via default runtime for a searoutes query (skips removed)", () => {
    const result = defaultFindRoutesByGroupRuntime.find({
      group: "searoutes",
      limit: 100,
    }) as { routes: Array<{ i: number }>; count: number };
    expect(new Set(result.routes.map((r) => r.i))).toEqual(new Set([5]));
    expect(result.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindRoutesByGroupRuntime.find({
        group: "roads",
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findRoutesByGroupTool.execute({ group: "roads" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
