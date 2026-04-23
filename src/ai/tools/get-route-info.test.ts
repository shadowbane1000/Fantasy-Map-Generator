import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawRoute } from "./_shared";
import {
  createGetRouteInfoTool,
  DEFAULT_POINTS_LIMIT,
  defaultRouteInfoRuntime,
  getRouteInfoTool,
  MAX_POINTS_LIMIT,
  type ReadRouteInfoResult,
  type RouteInfo,
  type RouteInfoPackLike,
  type RouteInfoRuntime,
  readRouteInfoFromPack,
} from "./get-route-info";

interface FakePack {
  routes: Array<RawRoute | undefined>;
}

function makePack(): FakePack {
  return {
    routes: [
      {
        i: 0,
        group: "roads",
        name: "King's Road",
        length: 500,
        feature: 1,
        lock: true,
        points: [
          [10, 20, 100],
          [30, 40, 101],
          [50, 60, 102],
        ],
      },
      undefined,
      {
        i: 2,
        group: "trails",
        name: "Silk Trail",
        // length missing → must fall back to hypot sum
        // 0,0 → 3,4 = 5, 3,4 → 6,8 = 5 → total 10
        feature: 1,
        points: [
          [0, 0, 10],
          [3, 4, 11],
          [6, 8, 12],
        ],
      },
      undefined,
      {
        i: 4,
        group: "searoutes",
        name: "Northern Passage",
        length: 1200,
        feature: 9, // water feature id
        points: [
          [100, 100, 200],
          [200, 200, 201],
        ],
      },
      {
        i: 5,
        group: "roads",
        name: "Ghost Road",
        removed: true,
        points: [[0, 0, 0]],
      },
      undefined,
      {
        i: 7,
        // minimal: no group beyond default, no name, no length, no feature,
        // no points, no lock
      },
    ],
  };
}

function runtimeReturning(result: ReadRouteInfoResult): RouteInfoRuntime {
  return { readRouteInfo: () => result };
}

function pureRead(ref: number | string, limit?: number): ReadRouteInfoResult {
  return readRouteInfoFromPack(
    makePack() as unknown as RouteInfoPackLike,
    ref,
    limit,
  );
}

describe("get_route_info tool — pure / seam", () => {
  it("returns a full dossier for a fully populated route (numeric id 0)", async () => {
    const info = pureRead(0);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetRouteInfoTool(runtimeReturning(info));
    const result = await tool.execute({ route: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(0);
    expect(body.name).toBe("King's Road");
    expect(body.group).toBe("roads");
    expect(body.length).toBe(500);
    expect(body.lock).toBe(true);
    expect(body.feature).toBe(1);
    expect(body.points).toEqual([
      [10, 20, 100],
      [30, 40, 101],
      [50, 60, 102],
    ]);
    expect(body.points_count).toBe(3);
  });

  it("falls back to summing hypot across point triples when route.length is absent", () => {
    const info = pureRead(2) as RouteInfo;
    // 3,4,5 triangle twice → total 10
    expect(info.length).toBe(10);
    expect(info.points_count).toBe(3);
  });

  it("returns raw feature id for sea routes", () => {
    const info = pureRead(4) as RouteInfo;
    expect(info.group).toBe("searoutes");
    expect(info.feature).toBe(9);
    expect(info.length).toBe(1200);
  });

  it("matches by case-insensitive name", () => {
    const info = pureRead("king's road") as RouteInfo;
    expect(info.i).toBe(0);
    expect(info.name).toBe("King's Road");
  });

  it("matches route 0 by numeric id (non-placeholder semantics)", () => {
    const info = pureRead(0) as RouteInfo;
    expect(info.i).toBe(0);
  });

  it("returns defaults for a minimal route (no name / length / feature / points)", () => {
    const info = pureRead(7) as RouteInfo;
    expect(info.i).toBe(7);
    expect(info.name).toBeNull();
    expect(info.group).toBe("");
    expect(info.length).toBe(0);
    expect(info.lock).toBe(false);
    expect(info.feature).toBe(0);
    expect(info.points).toEqual([]);
    expect(info.points_count).toBe(0);
  });

  it("truncates points to limit but still reports the full count", () => {
    const info = pureRead(0, 2) as RouteInfo;
    expect(info.points).toEqual([
      [10, 20, 100],
      [30, 40, 101],
    ]);
    expect(info.points_count).toBe(3);
  });

  it("limit=0 yields an empty points array but preserves points_count", () => {
    const info = pureRead(0, 0) as RouteInfo;
    expect(info.points).toEqual([]);
    expect(info.points_count).toBe(3);
  });

  it("limit >= points_count returns all points", () => {
    const info = pureRead(0, 9999) as RouteInfo;
    expect(info.points).toEqual([
      [10, 20, 100],
      [30, 40, 101],
      [50, 60, 102],
    ]);
  });

  it("coerces malformed point entries to zeros so it never throws", () => {
    const pack: FakePack = {
      routes: [
        {
          i: 0,
          group: "roads",
          name: "Broken",
          points: [
            [10, 20, 100],
            "bad" as unknown as never,
            [undefined, "nope", null] as unknown as never,
          ],
        },
      ],
    };
    const info = readRouteInfoFromPack(
      pack as unknown as RouteInfoPackLike,
      0,
    ) as RouteInfo;
    expect(info.points_count).toBe(3);
    expect(info.points[0]).toEqual([10, 20, 100]);
    expect(info.points[1]).toEqual([0, 0, 0]);
    expect(info.points[2]).toEqual([0, 0, 0]);
  });

  it("returns 'not-found' for removed routes (by id or name)", () => {
    expect(pureRead(5)).toBe("not-found");
    expect(pureRead("ghost road")).toBe("not-found");
  });

  it("returns 'not-found' for unknown numeric and name refs", () => {
    expect(pureRead(999)).toBe("not-found");
    expect(pureRead("nonesuch")).toBe("not-found");
  });

  it("returns 'not-ready' when pack or pack.routes is missing", () => {
    expect(readRouteInfoFromPack(undefined, 0)).toBe("not-ready");
    expect(
      readRouteInfoFromPack({ routes: undefined } as RouteInfoPackLike, 0),
    ).toBe("not-ready");
  });

  it("tool rejects non-integer / missing / empty / negative refs", async () => {
    const tool = createGetRouteInfoTool(runtimeReturning("not-found"));
    for (const bad of [
      {},
      { route: 1.5 },
      { route: null },
      { route: "" },
      { route: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /non-negative integer id or a non-empty name/i,
      );
    }
  });

  it("tool accepts numeric id 0 (no placeholder slot)", async () => {
    const info: RouteInfo = {
      i: 0,
      name: null,
      group: "roads",
      length: 0,
      lock: false,
      feature: 0,
      points: [],
      points_count: 0,
    };
    const tool = createGetRouteInfoTool(runtimeReturning(info));
    const r = await tool.execute({ route: 0 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content).i).toBe(0);
  });

  it("tool rejects bad limit values", async () => {
    const tool = createGetRouteInfoTool(runtimeReturning("not-found"));
    for (const bad of [
      { route: 1, limit: -1 },
      { route: 1, limit: 1.5 },
      { route: 1, limit: MAX_POINTS_LIMIT + 1 },
      { route: 1, limit: "ten" },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit must be an integer/i);
    }
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetRouteInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ route: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces not-found as a structured error with the ref quoted", async () => {
    const tool = createGetRouteInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ route: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No route found/i);
    expect(JSON.parse(result.content).error).toMatch(/"foo"/);
  });

  it("is exported as getRouteInfoTool with the expected schema", () => {
    expect(getRouteInfoTool.name).toBe("get_route_info");
    expect(getRouteInfoTool.input_schema.type).toBe("object");
    expect(getRouteInfoTool.input_schema.required).toEqual(["route"]);
    expect(getRouteInfoTool.input_schema.properties.route).toBeDefined();
    expect(getRouteInfoTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT_POINTS_LIMIT and MAX_POINTS_LIMIT constants", () => {
    expect(DEFAULT_POINTS_LIMIT).toBe(5000);
    expect(MAX_POINTS_LIMIT).toBe(5000);
  });
});

// ----- defaultRouteInfoRuntime integration -----

describe("defaultRouteInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads a real route via the default runtime", () => {
    const info = defaultRouteInfoRuntime.readRouteInfo(0, DEFAULT_POINTS_LIMIT);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const ri = info as RouteInfo;
    expect(ri.i).toBe(0);
    expect(ri.name).toBe("King's Road");
    expect(ri.group).toBe("roads");
    expect(ri.lock).toBe(true);
    expect(ri.points_count).toBe(3);
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultRouteInfoRuntime.readRouteInfo(0, DEFAULT_POINTS_LIMIT)).toBe(
      "not-ready",
    );
    const result = await getRouteInfoTool.execute({ route: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown route id through the tool", async () => {
    const result = await getRouteInfoTool.execute({ route: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No route found/i);
  });

  it("returns 'not-found' for a removed route through the tool", async () => {
    const result = await getRouteInfoTool.execute({ route: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No route found/i);
  });

  it("truncates points via the limit parameter through the tool", async () => {
    const result = await getRouteInfoTool.execute({ route: 0, limit: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.points).toEqual([[10, 20, 100]]);
    expect(body.points_count).toBe(3);
  });
});
