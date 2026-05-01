import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createSplitRouteTool,
  type SplitRouteRef,
  type SplitRouteRuntime,
  splitRouteTool,
} from "./split-route";

function makeRef(overrides: Partial<SplitRouteRef> = {}): SplitRouteRef {
  return {
    i: 5,
    name: "Coast Road",
    group: "roads",
    feature: 1,
    points: Array.from({ length: 10 }, (_, k) => [k * 10, k * 10, 100 + k]) as [
      number,
      number,
      number,
    ][],
    removed: false,
    ...overrides,
  };
}

function makeRuntime(overrides: Partial<SplitRouteRuntime> = {}): {
  runtime: SplitRouteRuntime;
  find: ReturnType<typeof vi.fn<SplitRouteRuntime["find"]>>;
  split: ReturnType<typeof vi.fn<SplitRouteRuntime["split"]>>;
} {
  const find = vi.fn<SplitRouteRuntime["find"]>(overrides.find ?? (() => null));
  const split = vi.fn<SplitRouteRuntime["split"]>(
    overrides.split ??
      (() => ({
        newRouteId: 23,
        oldPointCount: 5,
        newPointCount: 6,
        sharedCellId: 104,
      })),
  );
  return { runtime: { find, split }, find, split };
}

describe("split_route tool (stub runtime)", () => {
  it("happy path: route with 10 points, index=4 → 5 / 6 split", async () => {
    const ref = makeRef();
    const { runtime, find, split } = makeRuntime({
      find: (r) => (r === 5 ? ref : null),
      split: (_ref, idx) => ({
        newRouteId: 23,
        oldPointCount: idx + 1,
        newPointCount: ref.points.length - idx,
        sharedCellId: ref.points[idx][2],
      }),
    });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 5, index: 4 });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith(5);
    expect(split).toHaveBeenCalledWith(ref, 4);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      route: {
        i: 5,
        name: "Coast Road",
        previous_point_count: 10,
        point_count: 5,
      },
      new_route: {
        i: 23,
        name: "Coast Road",
        point_count: 6,
      },
      split_at_index: 4,
    });
  });

  it("shared cell at split point — last of old equals first of new", async () => {
    const ref = makeRef();
    const tracked: {
      old?: [number, number, number];
      new?: [number, number, number];
    } = {};
    const { runtime } = makeRuntime({
      find: () => ref,
      split: (r, idx) => {
        const oldP = r.points.slice(0, idx + 1);
        const newP = r.points.slice(idx);
        tracked.old = oldP[oldP.length - 1];
        tracked.new = newP[0];
        return {
          newRouteId: 99,
          oldPointCount: oldP.length,
          newPointCount: newP.length,
          sharedCellId: oldP[oldP.length - 1][2],
        };
      },
    });
    const tool = createSplitRouteTool(runtime);
    await tool.execute({ route: 5, index: 4 });
    expect(tracked.old).toBeDefined();
    expect(tracked.new).toBeDefined();
    // Same cell id at the boundary.
    expect(tracked.old?.[2]).toBe(tracked.new?.[2]);
    expect(tracked.old?.[2]).toBe(104); // 100 + 4
  });

  it("inherits group, feature, name from original (verified by integration suite)", async () => {
    // Stub runtime doesn't construct the new route — that's the
    // default-runtime suite's job. Here we sanity-check that the
    // tool surfaces `name` from the resolved ref into the new_route
    // body, which is the chat-visible inheritance proof.
    const ref = makeRef({ name: "Inland Way" });
    const { runtime } = makeRuntime({
      find: () => ref,
      split: () => ({
        newRouteId: 12,
        oldPointCount: 5,
        newPointCount: 6,
        sharedCellId: 104,
      }),
    });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 5, index: 4 });
    const body = JSON.parse(result.content);
    expect(body.new_route.name).toBe("Inland Way");
    expect(body.route.name).toBe("Inland Way");
  });

  it("omits name when original route has no name", async () => {
    const ref = makeRef({ name: "" });
    const { runtime } = makeRuntime({
      find: () => ref,
      split: () => ({
        newRouteId: 12,
        oldPointCount: 5,
        newPointCount: 6,
        sharedCellId: 104,
      }),
    });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 5, index: 4 });
    const body = JSON.parse(result.content);
    expect(body.route.name).toBeUndefined();
    expect(body.new_route.name).toBeUndefined();
  });

  it("uses Routes.getNextId via runtime — newRouteId surfaces verbatim", async () => {
    const ref = makeRef();
    const { runtime } = makeRuntime({
      find: () => ref,
      split: () => ({
        newRouteId: 777,
        oldPointCount: 5,
        newPointCount: 6,
        sharedCellId: 104,
      }),
    });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 5, index: 4 });
    expect(JSON.parse(result.content).new_route.i).toBe(777);
  });

  it("index = 0 → error", async () => {
    const ref = makeRef();
    const { runtime, split } = makeRuntime({ find: () => ref });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 5, index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index must be an integer in [1, 8].",
    );
    expect(split).not.toHaveBeenCalled();
  });

  it("index = points.length - 1 → error", async () => {
    const ref = makeRef();
    const { runtime, split } = makeRuntime({ find: () => ref });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 5, index: 9 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index must be an integer in [1, 8].",
    );
    expect(split).not.toHaveBeenCalled();
  });

  it("rejects out-of-range, fractional, NaN, missing index", async () => {
    const ref = makeRef();
    const { runtime, split } = makeRuntime({ find: () => ref });
    const tool = createSplitRouteTool(runtime);
    for (const bad of [-1, 100, 1.5, Number.NaN, undefined, null, "2", {}]) {
      const r = await tool.execute({ route: 5, index: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "index must be an integer in [1, 8].",
      );
    }
    expect(split).not.toHaveBeenCalled();
  });

  it("rejects bad route types; no find", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createSplitRouteTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, "", "   ", {}, true]) {
      const r = await tool.execute({ route: bad, index: 4 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "route must be a non-negative integer id or a non-empty name string.",
      );
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("route not found", async () => {
    const { runtime, split } = makeRuntime({ find: () => null });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 999, index: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Route 999 not found.");
    expect(split).not.toHaveBeenCalled();

    const r2 = await tool.execute({ route: "Ghost", index: 4 });
    expect(JSON.parse(r2.content).error).toBe('Route "Ghost" not found.');
  });

  it("removed route → distinct error, no split", async () => {
    const ref = makeRef({ removed: true, i: 7 });
    const { runtime, split } = makeRuntime({ find: () => ref });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 7, index: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot split removed route 7.",
    );
    expect(split).not.toHaveBeenCalled();
  });

  it("propagates runtime split errors", async () => {
    const ref = makeRef();
    const { runtime } = makeRuntime({
      find: () => ref,
      split: () => {
        throw new Error("Routes.getNextId boom");
      },
    });
    const tool = createSplitRouteTool(runtime);
    const result = await tool.execute({ route: 5, index: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Routes\.getNextId boom/);
  });

  it("has correct tool name and required-schema fields", () => {
    expect(splitRouteTool.name).toBe("split_route");
    expect(splitRouteTool.input_schema.required).toEqual(["route", "index"]);
  });
});

describe("split_route registry round-trip", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        {
          i: 0,
          group: "roads",
          name: "Coast Road",
          feature: 1,
          points: Array.from({ length: 10 }, (_, k) => [k, k * 2, 100 + k]),
        },
      ] satisfies RawRoute[],
      cells: { routes: {} as Record<number, Record<number, number>> },
    };
    (globalThis as { Routes?: unknown }).Routes = {
      getNextId: () => 42,
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(splitRouteTool);
    const result = await registry.run("split_route", { route: 0, index: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      route: {
        i: 0,
        name: "Coast Road",
        previous_point_count: 10,
        point_count: 5,
      },
      new_route: {
        i: 42,
        name: "Coast Road",
        point_count: 6,
      },
      split_at_index: 4,
    });
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes).toHaveLength(2);
    expect(pack.routes[1]?.i).toBe(42);
  });
});

describe("defaultSplitRouteRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;
  const originalRoutesSel = (globalThis as { routes?: unknown }).routes;
  const originalDraw = (globalThis as { drawRoutes?: unknown }).drawRoutes;

  function buildPack(): {
    routes: RawRoute[];
    cells: { routes: Record<number, Record<number, number>> };
  } {
    return {
      routes: [
        {
          i: 0,
          group: "roads",
          name: "Coast Road",
          feature: 1,
          points: [
            [0, 0, 100],
            [10, 10, 101],
            [20, 20, 102],
            [30, 30, 103],
            [40, 40, 104],
            [50, 50, 105],
            [60, 60, 106],
            [70, 70, 107],
            [80, 80, 108],
            [90, 90, 109],
          ] as [number, number, number][],
        },
        {
          i: 5,
          group: "trails",
          name: "Silk Trail",
          feature: 1,
          points: [
            [0, 0, 200],
            [1, 1, 201],
            [2, 2, 202],
            [3, 3, 203],
          ] as [number, number, number][],
        },
        {
          i: 9,
          group: "searoutes",
          name: "Old Sea",
          feature: 0,
          removed: true,
          points: [],
        },
      ] satisfies RawRoute[],
      // Pre-populate cells.routes so we can verify rewrites.
      cells: {
        routes: {
          100: { 101: 0 },
          101: { 100: 0, 102: 0 },
          102: { 101: 0, 103: 0 },
          103: { 102: 0, 104: 0 },
          104: { 103: 0, 105: 0 },
          105: { 104: 0, 106: 0 },
          106: { 105: 0, 107: 0 },
          107: { 106: 0, 108: 0 },
          108: { 107: 0, 109: 0 },
          109: { 108: 0 },
        },
      },
    };
  }

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = buildPack();
    (globalThis as { Routes?: unknown }).Routes = {
      getNextId: vi.fn(() => 23),
    };
    (globalThis as { routes?: unknown }).routes = undefined;
    (globalThis as { drawRoutes?: unknown }).drawRoutes = undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
    (globalThis as { routes?: unknown }).routes = originalRoutesSel;
    (globalThis as { drawRoutes?: unknown }).drawRoutes = originalDraw;
  });

  it("splits the live pack.routes object, preserves identity, rewires cells.routes", async () => {
    const pack = (globalThis as { pack: ReturnType<typeof buildPack> }).pack;
    const originalRouteRef = pack.routes[0];

    const result = await splitRouteTool.execute({ route: 0, index: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      route: {
        i: 0,
        name: "Coast Road",
        previous_point_count: 10,
        point_count: 5,
      },
      new_route: { i: 23, name: "Coast Road", point_count: 6 },
      split_at_index: 4,
    });

    // Object identity preserved on the original.
    expect(pack.routes[0]).toBe(originalRouteRef);
    // Original now has 5 points.
    expect(pack.routes[0]?.points).toHaveLength(5);
    // pack.routes grew by one.
    expect(pack.routes).toHaveLength(4);
    // Find the new route by id.
    const newRoute = pack.routes.find((r) => r?.i === 23);
    expect(newRoute).toBeDefined();
    expect(newRoute?.points).toHaveLength(6);
    expect(newRoute?.group).toBe("roads");
    expect(newRoute?.feature).toBe(1);
    expect(newRoute?.name).toBe("Coast Road");

    // Shared point — last of old equals first of new (same cell id 104).
    const oldPts = pack.routes[0]?.points as [number, number, number][];
    const newPts = newRoute?.points as [number, number, number][];
    expect(oldPts[oldPts.length - 1][2]).toBe(104);
    expect(newPts[0][2]).toBe(104);

    // cells.routes adjacency: pairs in newPoints now reference 23, not 0.
    const cr = pack.cells.routes;
    expect(cr[104]?.[105]).toBe(23);
    expect(cr[105]?.[104]).toBe(23);
    expect(cr[105]?.[106]).toBe(23);
    expect(cr[108]?.[109]).toBe(23);
    // Pairs strictly within oldPoints (excluding the boundary pair)
    // remain on route 0.
    expect(cr[100]?.[101]).toBe(0);
    expect(cr[103]?.[104]).toBe(0);
  });

  it("missing pack.routes → error", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: { routes: {} },
    };
    const result = await splitRouteTool.execute({ route: 0, index: 4 });
    expect(result.isError).toBe(true);
    // Resolved before runtime split because find returns null.
    expect(JSON.parse(result.content).error).toBe("Route 0 not found.");
  });

  it("missing pack.cells.routes → runtime error surfaces", async () => {
    const pack = buildPack();
    (pack as unknown as { cells: object }).cells = {};
    (globalThis as { pack?: unknown }).pack = pack;
    const result = await splitRouteTool.execute({ route: 0, index: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.cells.routes is not available; the map hasn't finished loading.",
    );
  });

  it("missing Routes.getNextId → runtime error surfaces", async () => {
    (globalThis as { Routes?: unknown }).Routes = {};
    const result = await splitRouteTool.execute({ route: 0, index: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Routes.getNextId is not available; the map hasn't finished loading.",
    );
  });

  it("calls Routes.getNextId() and uses its return value", async () => {
    const getNextId = vi.fn(() => 555);
    (globalThis as { Routes?: unknown }).Routes = { getNextId };
    const result = await splitRouteTool.execute({ route: 0, index: 4 });
    expect(result.isError).toBeFalsy();
    expect(getNextId).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content).new_route.i).toBe(555);
  });

  it("removed route by id → error, no mutation", async () => {
    const pack = (globalThis as { pack: ReturnType<typeof buildPack> }).pack;
    const beforeCount = pack.routes.length;
    const result = await splitRouteTool.execute({ route: 9, index: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot split removed route 9.",
    );
    expect(pack.routes).toHaveLength(beforeCount);
  });

  it("name match is case-insensitive", async () => {
    const result = await splitRouteTool.execute({
      route: "silk TRAIL",
      index: 1,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.route.i).toBe(5);
    expect(body.split_at_index).toBe(1);
  });
});
