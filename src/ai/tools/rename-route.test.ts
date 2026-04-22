import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import {
  createRenameRouteTool,
  findRouteByRef,
  type RouteRenameRef,
  type RouteRenameRuntime,
  renameRouteTool,
} from "./rename-route";

function makeRuntime(find: (ref: number | string) => RouteRenameRef | null): {
  runtime: RouteRenameRuntime;
  rename: ReturnType<typeof vi.fn<RouteRenameRuntime["rename"]>>;
} {
  const rename = vi.fn<RouteRenameRuntime["rename"]>();
  return { runtime: { find, rename }, rename };
}

describe("rename_route tool", () => {
  it("renames by numeric id", async () => {
    const { runtime, rename } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Silk Trail" } : null,
    );
    const tool = createRenameRouteTool(runtime);
    const result = await tool.execute({
      route: 5,
      name: "The King's Road",
    });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(5, "The King's Road");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Silk Trail",
      name: "The King's Road",
    });
  });

  it("renames by case-insensitive name", async () => {
    const find = vi.fn<RouteRenameRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "silk trail"
        ? { i: 5, name: "Silk Trail" }
        : null,
    );
    const { runtime, rename } = makeRuntime(find);
    const tool = createRenameRouteTool(runtime);
    await tool.execute({ route: "SILK TRAIL", name: "Iron Passage" });
    expect(find).toHaveBeenCalledWith("SILK TRAIL");
    expect(rename).toHaveBeenCalledWith(5, "Iron Passage");
  });

  it("trims the new name", async () => {
    const { runtime, rename } = makeRuntime(() => ({ i: 1, name: "x" }));
    const tool = createRenameRouteTool(runtime);
    await tool.execute({ route: 1, name: "  Main Road  " });
    expect(rename).toHaveBeenCalledWith(1, "Main Road");
  });

  it("errors when route is unknown", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameRouteTool(runtime);
    const result = await tool.execute({ route: 999, name: "New" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid route refs", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameRouteTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ route: bad, name: "New" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid name", async () => {
    const { runtime, rename } = makeRuntime(() => ({ i: 1, name: "x" }));
    const tool = createRenameRouteTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ route: 1, name: bad });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RouteRenameRuntime = {
      find: () => ({ i: 1, name: "x" }),
      rename: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createRenameRouteTool(runtime);
    const result = await tool.execute({ route: 1, name: "y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("findRouteByRef", () => {
  const routes: RawRoute[] = [
    { i: 1, name: "Silk Trail" },
    { i: 5, name: "Iron Passage" },
    { i: 9, name: "Retired Path", removed: true },
    { i: 12, name: "Sea Lane" },
  ];

  it("returns null when routes array is missing", () => {
    expect(findRouteByRef(undefined, 1)).toBeNull();
  });

  it("matches by numeric i with non-contiguous ids", () => {
    expect(findRouteByRef(routes, 5)).toBe(routes[1]);
    expect(findRouteByRef(routes, 12)).toBe(routes[3]);
    expect(findRouteByRef(routes, 2)).toBeNull();
  });

  it("skips removed routes", () => {
    expect(findRouteByRef(routes, 9)).toBeNull();
    expect(findRouteByRef(routes, "Retired Path")).toBeNull();
  });

  it("matches names case-insensitively and trims whitespace", () => {
    expect(findRouteByRef(routes, "silk trail")).toBe(routes[0]);
    expect(findRouteByRef(routes, "  SEA LANE  ")).toBe(routes[3]);
  });

  it("rejects invalid refs", () => {
    expect(findRouteByRef(routes, 1.5)).toBeNull();
    expect(findRouteByRef(routes, "")).toBeNull();
    expect(findRouteByRef(routes, "   ")).toBeNull();
  });
});

describe("defaultRouteRenameRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 1, name: "Silk Trail" },
        { i: 5, name: "Iron Passage" },
        { i: 9, name: "Retired Path", removed: true },
      ] satisfies RawRoute[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("renames the matching route at a non-contiguous id", async () => {
    const result = await renameRouteTool.execute({
      route: 5,
      name: "The King's Road",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.name).toBe("The King's Road");
  });

  it("refuses to rename a removed route", async () => {
    const result = await renameRouteTool.execute({
      route: 9,
      name: "X",
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[2]?.name).toBe("Retired Path");
  });
});
