import { describe, expect, it } from "vitest";
import {
  createListRoutesTool,
  type RoutePackLike,
  type RouteSummary,
  type RoutesRuntime,
  readRoutesFromPack,
  resolveRouteGroup,
} from "./list-routes";

function fakeRoutes(): RouteSummary[] {
  return [
    {
      i: 1,
      group: "roads",
      name: "King's Road",
      length: 300,
      feature: 1,
      points: 25,
      cells: 25,
      merged: false,
    },
    {
      i: 2,
      group: "trails",
      name: "Hunter's Trail",
      length: 50,
      feature: 1,
      points: 8,
      cells: 8,
      merged: false,
    },
    {
      i: 3,
      group: "searoutes",
      name: "Coastal Route",
      length: 500,
      feature: 0,
      points: 40,
      cells: 40,
      merged: false,
    },
    {
      i: 4,
      group: "roads",
      name: null,
      length: 0,
      feature: 1,
      points: 0,
      cells: 0,
      merged: false,
    },
  ];
}

function runtimeOf(routes: RouteSummary[] | null): RoutesRuntime {
  return { readRoutes: () => routes };
}

describe("list_routes tool", () => {
  it("returns the full list by default", async () => {
    const routes = fakeRoutes();
    const tool = createListRoutesTool(runtimeOf(routes));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(4);
    expect(body.routes).toEqual(routes);
  });

  it("honors limit/offset", async () => {
    const routes = fakeRoutes();
    const tool = createListRoutesTool(runtimeOf(routes));
    const result = await tool.execute({ limit: 2, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.routes).toEqual(routes.slice(1, 3));
  });

  it("rejects invalid paging", async () => {
    const tool = createListRoutesTool(runtimeOf(fakeRoutes()));
    for (const bad of [{ limit: 0 }, { limit: 501 }, { offset: -1 }]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
  });

  it("filters by group (case-insensitive with aliases)", async () => {
    const tool = createListRoutesTool(runtimeOf(fakeRoutes()));
    const result = await tool.execute({ group: "ROADS" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.routes.every((r: RouteSummary) => r.group === "roads")).toBe(
      true,
    );
    expect(body.filters.group).toBe("roads");

    const trailsResult = await tool.execute({ group: "trail" });
    expect(JSON.parse(trailsResult.content).filters.group).toBe("trails");

    const seaResult = await tool.execute({ group: "sea lanes" });
    expect(JSON.parse(seaResult.content).filters.group).toBe("searoutes");
  });

  it("rejects unknown group with a helpful message", async () => {
    const tool = createListRoutesTool(runtimeOf(fakeRoutes()));
    const result = await tool.execute({ group: "highway" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/roads|trails|searoutes/);
  });

  it("filters by min_length", async () => {
    const tool = createListRoutesTool(runtimeOf(fakeRoutes()));
    const result = await tool.execute({ min_length: 100 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.routes.every((r: RouteSummary) => r.length >= 100)).toBe(true);
  });

  it("rejects invalid min_length", async () => {
    const tool = createListRoutesTool(runtimeOf(fakeRoutes()));
    for (const bad of [-1, Number.NaN, "50", Number.POSITIVE_INFINITY]) {
      expect((await tool.execute({ min_length: bad })).isError).toBe(true);
    }
  });

  it("errors when the map isn't ready", async () => {
    const tool = createListRoutesTool(runtimeOf(null));
    expect((await tool.execute({})).isError).toBe(true);
  });
});

describe("readRoutesFromPack", () => {
  it("maps raw routes into summaries with counts", () => {
    const pack: RoutePackLike = {
      routes: [
        {
          i: 1,
          group: "roads",
          name: "Main",
          length: 100,
          feature: 2,
          points: [
            [0, 0, 1],
            [1, 1, 2],
            [2, 2, 3],
          ],
          cells: [1, 2, 3],
          merged: true,
        },
        {
          i: 2,
          group: "trails",
          // no name, no length, no points/cells
        },
      ],
    };
    const out = readRoutesFromPack(pack);
    expect(out).toEqual([
      {
        i: 1,
        group: "roads",
        name: "Main",
        length: 100,
        feature: 2,
        points: 3,
        cells: 3,
        merged: true,
      },
      {
        i: 2,
        group: "trails",
        name: null,
        length: 0,
        feature: 0,
        points: 0,
        cells: 0,
        merged: false,
      },
    ]);
  });

  it("skips removed routes and tolerates missing fields", () => {
    const pack: RoutePackLike = {
      routes: [
        { i: 1, group: "roads" },
        { i: 2, removed: true, group: "trails" },
      ],
    };
    const out = readRoutesFromPack(pack);
    expect(out).toHaveLength(1);
    expect(out?.[0].i).toBe(1);
  });

  it("returns null when pack/routes are missing", () => {
    expect(readRoutesFromPack(undefined)).toBeNull();
    expect(readRoutesFromPack({})).toBeNull();
  });
});

describe("resolveRouteGroup", () => {
  it("canonicalizes aliases", () => {
    expect(resolveRouteGroup("road")).toBe("roads");
    expect(resolveRouteGroup("ROADS")).toBe("roads");
    expect(resolveRouteGroup("trail")).toBe("trails");
    expect(resolveRouteGroup("sea lanes")).toBe("searoutes");
    expect(resolveRouteGroup("searoute")).toBe("searoutes");
  });
  it("returns null for unknown or invalid inputs", () => {
    expect(resolveRouteGroup("highway")).toBeNull();
    expect(resolveRouteGroup("")).toBeNull();
    expect(resolveRouteGroup("   ")).toBeNull();
    expect(resolveRouteGroup(42)).toBeNull();
    expect(resolveRouteGroup(null)).toBeNull();
  });
});
