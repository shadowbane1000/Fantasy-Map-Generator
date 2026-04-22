import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import {
  createRemoveRouteTool,
  type RemoveRouteRef,
  type RouteRemovalRuntime,
  removeRouteTool,
} from "./remove-route";

function makeRuntime(find: (ref: number | string) => RemoveRouteRef | null): {
  runtime: RouteRemovalRuntime;
  remove: ReturnType<typeof vi.fn<RouteRemovalRuntime["remove"]>>;
} {
  const remove = vi.fn<RouteRemovalRuntime["remove"]>();
  return { runtime: { find, remove }, remove };
}

describe("remove_route tool", () => {
  it("removes by numeric id", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Silk Trail" } : null,
    );
    const tool = createRemoveRouteTool(runtime);
    const result = await tool.execute({ route: 5 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Silk Trail",
    });
  });

  it("removes by case-insensitive name", async () => {
    const find = vi.fn<RouteRemovalRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "silk trail"
        ? { i: 5, name: "Silk Trail" }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveRouteTool(runtime);
    await tool.execute({ route: "SILK TRAIL" });
    expect(find).toHaveBeenCalledWith("SILK TRAIL");
    expect(remove).toHaveBeenCalledWith(5);
  });

  it("errors when the route is unknown", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveRouteTool(runtime);
    const result = await tool.execute({ route: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid route refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveRouteTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ route: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RouteRemovalRuntime = {
      find: () => ({ i: 1, name: "x" }),
      remove: vi.fn(() => {
        throw new Error("Routes.remove is not available yet");
      }),
    };
    const tool = createRemoveRouteTool(runtime);
    const result = await tool.execute({ route: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });
});

describe("defaultRouteRemovalRuntime (integration)", () => {
  const routesRemove = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    routesRemove.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 1, name: "Silk Trail" },
        { i: 5, name: "Iron Passage" },
        { i: 9, name: "Retired Path", removed: true },
      ] satisfies RawRoute[],
    };
    (globalThis as { Routes?: unknown }).Routes = { remove: routesRemove };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
  });

  it("calls Routes.remove with the live route object", async () => {
    const result = await removeRouteTool.execute({ route: 5 });
    expect(result.isError).toBeFalsy();
    expect(routesRemove).toHaveBeenCalledTimes(1);
    const arg = routesRemove.mock.calls[0]?.[0] as RawRoute;
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(arg).toBe(pack.routes[1]);
  });

  it("refuses to remove an already-removed route", async () => {
    const result = await removeRouteTool.execute({ route: 9 });
    expect(result.isError).toBe(true);
    expect(routesRemove).not.toHaveBeenCalled();
  });

  it("errors when Routes is not available", async () => {
    (globalThis as { Routes?: unknown }).Routes = undefined;
    const result = await removeRouteTool.execute({ route: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Routes\.remove/);
  });
});
