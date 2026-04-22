import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import {
  createSetRouteGroupTool,
  type RouteGroupRef,
  type RouteGroupRuntime,
  setRouteGroupTool,
} from "./set-route-group";

function makeRuntime(find: (ref: number | string) => RouteGroupRef | null): {
  runtime: RouteGroupRuntime;
  apply: ReturnType<typeof vi.fn<RouteGroupRuntime["apply"]>>;
} {
  const apply = vi.fn<RouteGroupRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_route_group tool", () => {
  it("sets canonical group by id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Iron Passage", previousGroup: "roads" } : null,
    );
    const tool = createSetRouteGroupTool(runtime);
    const result = await tool.execute({ route: 5, group: "searoutes" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "searoutes");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Iron Passage",
      previousGroup: "roads",
      group: "searoutes",
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<RouteGroupRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "iron passage"
        ? { i: 5, name: "Iron Passage", previousGroup: "roads" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetRouteGroupTool(runtime);
    await tool.execute({ route: "IRON PASSAGE", group: "trails" });
    expect(find).toHaveBeenCalledWith("IRON PASSAGE");
    expect(apply).toHaveBeenCalledWith(5, "trails");
  });

  it("resolves aliases to canonical groups", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousGroup: "roads",
    }));
    const tool = createSetRouteGroupTool(runtime);
    apply.mockClear();
    await tool.execute({ route: 1, group: "road" });
    expect(apply).toHaveBeenCalledWith(1, "roads");
    apply.mockClear();
    await tool.execute({ route: 1, group: "sea lanes" });
    expect(apply).toHaveBeenCalledWith(1, "searoutes");
    apply.mockClear();
    await tool.execute({ route: 1, group: "trail" });
    expect(apply).toHaveBeenCalledWith(1, "trails");
  });

  it("rejects unknown group strings", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousGroup: null,
    }));
    const tool = createSetRouteGroupTool(runtime);
    const result = await tool.execute({ route: 1, group: "Highway" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid route refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRouteGroupTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ route: bad, group: "roads" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string group", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousGroup: null,
    }));
    const tool = createSetRouteGroupTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42]) {
      const r = await tool.execute({ route: 1, group: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when the route is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRouteGroupTool(runtime);
    const result = await tool.execute({ route: 999, group: "roads" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RouteGroupRuntime = {
      find: () => ({ i: 1, name: "x", previousGroup: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetRouteGroupTool(runtime);
    const result = await tool.execute({ route: 1, group: "trails" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultRouteGroupRuntime (integration)", () => {
  const routeEl = {};
  const appendChild = vi.fn();
  const groupEl = { appendChild };
  const getElementById = vi.fn((id: string) => {
    if (id === "route5") return routeEl;
    if (id === "searoutes") return groupEl;
    return null;
  });

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    appendChild.mockReset();
    getElementById.mockClear();
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 1, name: "Silk Trail", group: "roads" },
        { i: 5, name: "Iron Passage", group: "roads" },
        {
          i: 9,
          name: "Retired Path",
          group: "trails",
          removed: true,
        },
      ] satisfies RawRoute[],
    };
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("updates the route's group and reparents the SVG", async () => {
    const result = await setRouteGroupTool.execute({
      route: 5,
      group: "searoutes",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.group).toBe("searoutes");
    expect(appendChild).toHaveBeenCalledWith(routeEl);
  });

  it("accepts an alias like 'sea lanes'", async () => {
    const result = await setRouteGroupTool.execute({
      route: 5,
      group: "sea lanes",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.group).toBe("searoutes");
  });

  it("still updates data when the group element is missing", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => (id === "route5" ? routeEl : null),
    };
    const result = await setRouteGroupTool.execute({
      route: 5,
      group: "trails",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.group).toBe("trails");
  });

  it("refuses to regroup a removed route", async () => {
    const result = await setRouteGroupTool.execute({
      route: 9,
      group: "roads",
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[2]?.group).toBe("trails");
  });
});
