import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import { ToolRegistry } from "./index";
import {
  computeMergedPoints,
  createJoinRoutesTool,
  determineMergeCase,
  type JoinRoutesApplyArgs,
  type JoinRoutesRuntime,
  joinRoutesTool,
} from "./join-routes";

function makeRuntime(overrides: Partial<JoinRoutesRuntime> = {}): {
  runtime: JoinRoutesRuntime;
  find: ReturnType<typeof vi.fn<JoinRoutesRuntime["find"]>>;
  apply: ReturnType<typeof vi.fn<JoinRoutesRuntime["apply"]>>;
} {
  const find = vi.fn<JoinRoutesRuntime["find"]>(overrides.find ?? (() => null));
  const apply = vi.fn<JoinRoutesRuntime["apply"]>(
    overrides.apply ?? (() => undefined),
  );
  return { runtime: { find, apply }, find, apply };
}

function makeRoute(
  i: number,
  name: string,
  points: number[][],
  extra: Partial<RawRoute> = {},
): RawRoute {
  return { i, name, group: "roads", points, ...extra };
}

describe("join_routes pure helpers", () => {
  it("determineMergeCase returns null for empty inputs", () => {
    expect(determineMergeCase([], [[1, 2, 3]])).toBeNull();
    expect(determineMergeCase([[1, 2, 3]], [])).toBeNull();
  });

  it("determineMergeCase prefers tail-head over other matches", () => {
    // route ends at cell 7, other starts at cell 7
    const route = [
      [0, 0, 1],
      [10, 10, 7],
    ];
    const other = [
      [10, 10, 7],
      [20, 20, 9],
    ];
    expect(determineMergeCase(route, other)).toBe("tail-head");
  });

  it("computeMergedPoints head-head reverses the surviving route", () => {
    const route = [
      [0, 0, 5],
      [10, 10, 6],
      [20, 20, 7],
    ];
    const other = [
      [0, 0, 5],
      [30, 30, 8],
    ];
    expect(computeMergedPoints(route, other, "head-head")).toEqual([
      [20, 20, 7],
      [10, 10, 6],
      [0, 0, 5],
      [30, 30, 8],
    ]);
    // ensure original route was not mutated
    expect(route).toEqual([
      [0, 0, 5],
      [10, 10, 6],
      [20, 20, 7],
    ]);
  });

  it("computeMergedPoints tail-tail reverses the joined route", () => {
    const route = [
      [0, 0, 1],
      [10, 10, 2],
    ];
    const other = [
      [50, 50, 9],
      [10, 10, 2],
    ];
    expect(computeMergedPoints(route, other, "tail-tail")).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [50, 50, 9],
    ]);
    expect(other).toEqual([
      [50, 50, 9],
      [10, 10, 2],
    ]);
  });
});

describe("join_routes tool (stub runtime)", () => {
  it("happy path tail-head", async () => {
    const route = makeRoute(5, "Coast Road", [
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
    ]);
    const other = makeRoute(12, "Mountain Pass", [
      [20, 20, 3],
      [30, 30, 4],
      [40, 40, 5],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : id === 12 ? other : null,
    );
    const captured = { args: null as JoinRoutesApplyArgs | null };
    const apply = vi.fn<JoinRoutesRuntime["apply"]>((args) => {
      captured.args = args;
    });
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBeFalsy();
    expect(captured.args).not.toBeNull();
    expect(captured.args?.mergeCase).toBe("tail-head");
    expect(captured.args?.mergedPoints).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
      [30, 30, 4],
      [40, 40, 5],
    ]);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      route: {
        i: 5,
        name: "Coast Road",
        previous_point_count: 3,
        point_count: 5,
      },
      joined_route: { i: 12, name: "Mountain Pass", removed: true },
      merge_case: "tail-head",
    });
  });

  it("happy path head-tail", async () => {
    const route = makeRoute(5, "Coast Road", [
      [20, 20, 3],
      [30, 30, 4],
    ]);
    const other = makeRoute(12, "Mountain Pass", [
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : id === 12 ? other : null,
    );
    const captured = { args: null as JoinRoutesApplyArgs | null };
    const apply = vi.fn<JoinRoutesRuntime["apply"]>((args) => {
      captured.args = args;
    });
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBeFalsy();
    expect(captured.args?.mergeCase).toBe("head-tail");
    expect(captured.args?.mergedPoints).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
      [30, 30, 4],
    ]);
    expect(JSON.parse(result.content).merge_case).toBe("head-tail");
    expect(JSON.parse(result.content).route.point_count).toBe(4);
  });

  it("happy path head-head (route is reversed before appending)", async () => {
    const route = makeRoute(5, "A", [
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
    ]);
    const other = makeRoute(12, "B", [
      [0, 0, 1],
      [30, 30, 4],
      [40, 40, 5],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : id === 12 ? other : null,
    );
    const captured = { args: null as JoinRoutesApplyArgs | null };
    const apply = vi.fn<JoinRoutesRuntime["apply"]>((args) => {
      captured.args = args;
    });
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBeFalsy();
    expect(captured.args?.mergeCase).toBe("head-head");
    expect(captured.args?.mergedPoints).toEqual([
      [20, 20, 3],
      [10, 10, 2],
      [0, 0, 1],
      [30, 30, 4],
      [40, 40, 5],
    ]);
    expect(JSON.parse(result.content).merge_case).toBe("head-head");
  });

  it("happy path tail-tail (other is reversed before appending)", async () => {
    const route = makeRoute(5, "A", [
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
    ]);
    const other = makeRoute(12, "B", [
      [40, 40, 5],
      [30, 30, 4],
      [20, 20, 3],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : id === 12 ? other : null,
    );
    const captured = { args: null as JoinRoutesApplyArgs | null };
    const apply = vi.fn<JoinRoutesRuntime["apply"]>((args) => {
      captured.args = args;
    });
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBeFalsy();
    expect(captured.args?.mergeCase).toBe("tail-tail");
    expect(captured.args?.mergedPoints).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
      [30, 30, 4],
      [40, 40, 5],
    ]);
    expect(JSON.parse(result.content).merge_case).toBe("tail-tail");
  });

  it("rejects same id (route === other)", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createJoinRoutesTool(runtime);
    const result = await tool.execute({ route: 5, other: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "route and other must be different route ids.",
    );
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when route not found", async () => {
    const { runtime, apply } = makeRuntime({ find: () => null });
    const tool = createJoinRoutesTool(runtime);
    const result = await tool.execute({ route: 999, other: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Route 999 not found.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when other not found", async () => {
    const route = makeRoute(5, "A", [[0, 0, 1]]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : null,
    );
    const apply = vi.fn<JoinRoutesRuntime["apply"]>();
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Route 999 not found.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("removed surviving route → not found", async () => {
    // findRouteByRef-style: removed routes return null
    const find = vi.fn<JoinRoutesRuntime["find"]>(() => null);
    const apply = vi.fn<JoinRoutesRuntime["apply"]>();
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Route 5 not found.");
  });

  it("removed joined route → not found", async () => {
    const route = makeRoute(5, "A", [
      [0, 0, 1],
      [10, 10, 2],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : null,
    );
    const apply = vi.fn<JoinRoutesRuntime["apply"]>();
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Route 12 not found.");
  });

  it("no shared endpoint → error (NOT silent no-op)", async () => {
    const route = makeRoute(5, "A", [
      [0, 0, 1],
      [10, 10, 2],
    ]);
    const other = makeRoute(12, "B", [
      [50, 50, 99],
      [60, 60, 100],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : id === 12 ? other : null,
    );
    const apply = vi.fn<JoinRoutesRuntime["apply"]>();
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Routes 5 and 12 do not share an endpoint cell. Cannot join.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("point_count math: previous + other - 1", async () => {
    const route = makeRoute(5, "A", [
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
      [30, 30, 4],
    ]);
    const other = makeRoute(12, "B", [
      [30, 30, 4],
      [40, 40, 5],
      [50, 50, 6],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : id === 12 ? other : null,
    );
    const apply = vi.fn<JoinRoutesRuntime["apply"]>();
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.route.previous_point_count).toBe(4);
    expect(body.route.point_count).toBe(4 + 3 - 1);
  });

  it("rejects non-integer route", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createJoinRoutesTool(runtime);
    for (const bad of [null, undefined, 1.5, "5", {}, true, NaN]) {
      const r = await tool.execute({ route: bad, other: 1 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "route must be a non-negative integer id.",
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-integer other", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createJoinRoutesTool(runtime);
    for (const bad of [null, undefined, 1.5, "5", {}, true, NaN]) {
      const r = await tool.execute({ route: 1, other: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "other must be a non-negative integer id.",
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects negative route", async () => {
    const { runtime } = makeRuntime();
    const tool = createJoinRoutesTool(runtime);
    const result = await tool.execute({ route: -1, other: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "route must be a non-negative integer id.",
    );
  });

  it("rejects negative other", async () => {
    const { runtime } = makeRuntime();
    const tool = createJoinRoutesTool(runtime);
    const result = await tool.execute({ route: 0, other: -1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "other must be a non-negative integer id.",
    );
  });

  it("preserves the surviving route object identity (find returns same ref)", async () => {
    const route = makeRoute(5, "A", [
      [0, 0, 1],
      [10, 10, 2],
    ]);
    const other = makeRoute(12, "B", [
      [10, 10, 2],
      [20, 20, 3],
    ]);
    const find = vi.fn<JoinRoutesRuntime["find"]>((id) =>
      id === 5 ? route : id === 12 ? other : null,
    );
    let capturedRouteRef: RawRoute | null = null;
    const apply = vi.fn<JoinRoutesRuntime["apply"]>((args) => {
      capturedRouteRef = args.route;
      args.route.points = args.mergedPoints;
    });
    const tool = createJoinRoutesTool({ find, apply });
    const result = await tool.execute({ route: 5, other: 12 });
    expect(result.isError).toBeFalsy();
    expect(capturedRouteRef).toBe(route);
    expect(route.points).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
    ]);
  });

  it("has correct tool name and required-schema fields", () => {
    expect(joinRoutesTool.name).toBe("join_routes");
    expect(joinRoutesTool.input_schema.required).toEqual(["route", "other"]);
  });
});

describe("join_routes registry round-trip", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        makeRoute(0, "Old A", [
          [0, 0, 1],
          [10, 10, 2],
        ]),
        makeRoute(1, "Old B", [
          [10, 10, 2],
          [20, 20, 3],
        ]),
      ] satisfies RawRoute[],
      cells: { routes: { 1: { 2: 0 }, 2: { 1: 0, 3: 1 }, 3: { 2: 1 } } },
    };
    (globalThis as { Routes?: unknown }).Routes = {
      remove: (route: RawRoute) => {
        const pack = (
          globalThis as {
            pack: {
              routes: RawRoute[];
              cells: { routes: Record<number, Record<number, number>> };
            };
          }
        ).pack;
        const cellRoutes = pack.cells.routes;
        const points = (route.points ?? []) as number[][];
        for (const point of points) {
          const from = point?.[2];
          if (typeof from !== "number" || !cellRoutes[from]) continue;
          for (const [to, routeId] of Object.entries(cellRoutes[from])) {
            if (routeId === route.i) {
              delete cellRoutes[from][parseInt(to, 10)];
              const toCell = cellRoutes[parseInt(to, 10)];
              if (toCell) delete toCell[from];
            }
          }
        }
        pack.routes = pack.routes.filter((r) => r.i !== route.i);
      },
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(joinRoutesTool);
    const result = await registry.run("join_routes", { route: 0, other: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.merge_case).toBe("tail-head");
    const pack = (
      globalThis as {
        pack: {
          routes: RawRoute[];
          cells: { routes: Record<number, Record<number, number>> };
        };
      }
    ).pack;
    expect(pack.routes).toHaveLength(1);
    expect(pack.routes[0]?.i).toBe(0);
    expect(pack.routes[0]?.points).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
    ]);
  });
});

describe("defaultJoinRoutesRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;
  const originalRedrawRoute = (globalThis as { redrawRoute?: unknown })
    .redrawRoute;

  function setUpPack() {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        makeRoute(0, "Coast Road", [
          [0, 0, 1],
          [10, 10, 2],
          [20, 20, 3],
        ]),
        makeRoute(1, "Mountain Pass", [
          [20, 20, 3],
          [30, 30, 4],
          [40, 40, 5],
        ]),
      ] satisfies RawRoute[],
      cells: {
        routes: {
          1: { 2: 0 },
          2: { 1: 0, 3: 0 },
          3: { 2: 0, 4: 1 },
          4: { 3: 1, 5: 1 },
          5: { 4: 1 },
        },
      },
    };
  }

  function makeRoutesModule() {
    return {
      remove: vi.fn((route: RawRoute) => {
        const pack = (
          globalThis as {
            pack: {
              routes: RawRoute[];
              cells: { routes: Record<number, Record<number, number>> };
            };
          }
        ).pack;
        const cellRoutes = pack.cells.routes;
        const points = (route.points ?? []) as number[][];
        for (const point of points) {
          const from = point?.[2];
          if (typeof from !== "number" || !cellRoutes[from]) continue;
          for (const [to, routeId] of Object.entries(cellRoutes[from])) {
            if (routeId === route.i) {
              delete cellRoutes[from][parseInt(to, 10)];
              const toCell = cellRoutes[parseInt(to, 10)];
              if (toCell) delete toCell[from];
            }
          }
        }
        pack.routes = pack.routes.filter((r) => r.i !== route.i);
      }),
    };
  }

  beforeEach(() => {
    setUpPack();
    (globalThis as { Routes?: unknown }).Routes = makeRoutesModule();
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
    (globalThis as { redrawRoute?: unknown }).redrawRoute = originalRedrawRoute;
  });

  it("tail-head end-to-end: cells.routes and pack.routes updated", async () => {
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: {
          routes: RawRoute[];
          cells: { routes: Record<number, Record<number, number>> };
        };
      }
    ).pack;
    // joined route gone
    expect(pack.routes).toHaveLength(1);
    expect(pack.routes[0]?.i).toBe(0);
    // surviving route's points are merged
    expect(pack.routes[0]?.points).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
      [30, 30, 4],
      [40, 40, 5],
    ]);
    // bidirectional adjacency for ALL pairs in merged path, all → 0
    expect(pack.cells.routes[1]?.[2]).toBe(0);
    expect(pack.cells.routes[2]?.[1]).toBe(0);
    expect(pack.cells.routes[2]?.[3]).toBe(0);
    expect(pack.cells.routes[3]?.[2]).toBe(0);
    expect(pack.cells.routes[3]?.[4]).toBe(0);
    expect(pack.cells.routes[4]?.[3]).toBe(0);
    expect(pack.cells.routes[4]?.[5]).toBe(0);
    expect(pack.cells.routes[5]?.[4]).toBe(0);
  });

  it("no leftover connections tagged with the joined route's id", async () => {
    await joinRoutesTool.execute({ route: 0, other: 1 });
    const pack = (
      globalThis as {
        pack: {
          cells: { routes: Record<number, Record<number, number>> };
        };
      }
    ).pack;
    // walk the entire adjacency map; nothing should still be tagged with id 1
    for (const fromKey of Object.keys(pack.cells.routes)) {
      const inner = pack.cells.routes[parseInt(fromKey, 10)];
      if (!inner) continue;
      for (const toKey of Object.keys(inner)) {
        expect(inner[parseInt(toKey, 10)]).not.toBe(1);
      }
    }
  });

  it("missing pack.routes → error", async () => {
    (globalThis as { pack?: unknown }).pack = {
      cells: { routes: {} },
    };
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBe(true);
    // Find can't resolve without routes
    expect(JSON.parse(result.content).error).toBe("Route 0 not found.");
  });

  it("missing pack.cells.routes → error", async () => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        makeRoute(0, "A", [
          [0, 0, 1],
          [10, 10, 2],
        ]),
        makeRoute(1, "B", [
          [10, 10, 2],
          [20, 20, 3],
        ]),
      ] satisfies RawRoute[],
      cells: {},
    };
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.cells.routes is not available; the map hasn't finished loading.",
    );
  });

  it("missing Routes (undefined) → error", async () => {
    (globalThis as { Routes?: unknown }).Routes = undefined;
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Routes.remove is not available; the map hasn't finished loading.",
    );
  });

  it("Routes.remove not a function → error", async () => {
    (globalThis as { Routes?: unknown }).Routes = { remove: "nope" };
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Routes.remove is not available; the map hasn't finished loading.",
    );
  });

  it("Routes.remove called exactly once with the joined route reference", async () => {
    const pack = (
      globalThis as {
        pack: { routes: RawRoute[] };
      }
    ).pack;
    const joinedRouteRef = pack.routes[1];
    await joinRoutesTool.execute({ route: 0, other: 1 });
    const routesModule = (
      globalThis as {
        Routes: { remove: ReturnType<typeof vi.fn> };
      }
    ).Routes;
    expect(routesModule.remove).toHaveBeenCalledTimes(1);
    expect(routesModule.remove.mock.calls[0]?.[0]).toBe(joinedRouteRef);
  });

  it("integration: head-head reverses surviving route", async () => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        makeRoute(0, "A", [
          [0, 0, 5],
          [10, 10, 6],
          [20, 20, 7],
        ]),
        makeRoute(1, "B", [
          [0, 0, 5],
          [30, 30, 8],
          [40, 40, 9],
        ]),
      ] satisfies RawRoute[],
      cells: { routes: {} },
    };
    (globalThis as { Routes?: unknown }).Routes = makeRoutesModule();
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { routes: RawRoute[] };
      }
    ).pack;
    expect(pack.routes[0]?.points).toEqual([
      [20, 20, 7],
      [10, 10, 6],
      [0, 0, 5],
      [30, 30, 8],
      [40, 40, 9],
    ]);
    expect(JSON.parse(result.content).merge_case).toBe("head-head");
  });

  it("integration: tail-tail reverses joined route", async () => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        makeRoute(0, "A", [
          [0, 0, 1],
          [10, 10, 2],
          [20, 20, 3],
        ]),
        makeRoute(1, "B", [
          [40, 40, 9],
          [30, 30, 8],
          [20, 20, 3],
        ]),
      ] satisfies RawRoute[],
      cells: { routes: {} },
    };
    (globalThis as { Routes?: unknown }).Routes = makeRoutesModule();
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { routes: RawRoute[] };
      }
    ).pack;
    expect(pack.routes[0]?.points).toEqual([
      [0, 0, 1],
      [10, 10, 2],
      [20, 20, 3],
      [30, 30, 8],
      [40, 40, 9],
    ]);
    expect(JSON.parse(result.content).merge_case).toBe("tail-tail");
  });

  it("best-effort calls redrawRoute(route) when present, swallows throws", async () => {
    const redraw = vi.fn((_route: RawRoute) => {
      throw new Error("redraw boom");
    });
    (globalThis as { redrawRoute?: unknown }).redrawRoute = redraw;
    const result = await joinRoutesTool.execute({ route: 0, other: 1 });
    expect(result.isError).toBeFalsy();
    expect(redraw).toHaveBeenCalledTimes(1);
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(redraw.mock.calls[0]?.[0]).toBe(pack.routes[0]);
  });
});
