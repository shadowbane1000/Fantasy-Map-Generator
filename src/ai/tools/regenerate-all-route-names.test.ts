import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRegenerateAllRouteNamesTool,
  type RegenerateAllRouteNamesRuntime,
  regenerateAllRouteNamesTool,
} from "./regenerate-all-route-names";

function makeRuntime(overrides: Partial<RegenerateAllRouteNamesRuntime> = {}): {
  runtime: RegenerateAllRouteNamesRuntime;
  getRoutes: ReturnType<
    typeof vi.fn<RegenerateAllRouteNamesRuntime["getRoutes"]>
  >;
  generateName: ReturnType<
    typeof vi.fn<RegenerateAllRouteNamesRuntime["generateName"]>
  >;
} {
  const getRoutes = vi.fn<RegenerateAllRouteNamesRuntime["getRoutes"]>(
    overrides.getRoutes ?? (() => []),
  );
  const generateName = vi.fn<RegenerateAllRouteNamesRuntime["generateName"]>(
    overrides.generateName ?? (() => "Generated"),
  );
  return {
    runtime: { getRoutes, generateName },
    getRoutes,
    generateName,
  };
}

// Stub-runtime tests still write through the live `globalThis.pack.routes`
// (apply is not seamed through the runtime interface — only getRoutes /
// generateName are). We therefore set up a matching pack.routes in beforeEach
// and clean it up in afterEach.
describe("regenerate_all_route_names tool (stub runtime)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 0, group: "roads", name: "Placeholder", points: [] },
        { i: 1, group: "roads", name: "Old A", points: [[1, 1, 1]] },
        { i: 2, group: "trails", name: "Old B", points: [[2, 2, 2]] },
        { i: 3, group: "searoutes", name: "Old C", points: [[3, 3, 3]] },
        { i: 4, group: "roads", points: [[4, 4, 4]] }, // no current name
      ] satisfies RawRoute[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("happy path: regenerates every unlocked non-zero route", async () => {
    let counter = 0;
    const { runtime, getRoutes, generateName } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "Placeholder", points: [] },
        { i: 1, group: "roads", name: "Old A", points: [] },
        { i: 2, group: "trails", name: "Old B", points: [] },
        { i: 3, group: "searoutes", name: "Old C", points: [] },
      ],
      generateName: () => `New ${++counter}`,
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      regenerated: 3,
      locked: 0,
    });
    // getRoutes called once, generateName called once per non-zero unlocked
    expect(getRoutes).toHaveBeenCalledTimes(1);
    expect(generateName).toHaveBeenCalledTimes(3);

    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.name).toBe("New 1");
    expect(pack.routes[2]?.name).toBe("New 2");
    expect(pack.routes[3]?.name).toBe("New 3");
  });

  it("preserves locked routes (lock=1)", async () => {
    const { runtime, generateName } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 1, group: "roads", name: "Old A", points: [], lock: true },
        { i: 2, group: "trails", name: "Old B", points: [], lock: true },
      ],
      generateName: () => "Should not appear",
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 2,
      regenerated: 0,
      locked: 2,
    });
    expect(generateName).not.toHaveBeenCalled();

    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.name).toBe("Old A");
    expect(pack.routes[2]?.name).toBe("Old B");
  });

  it("mixed locked + unlocked: only unlocked re-rolled", async () => {
    let counter = 0;
    const { runtime, generateName } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 1, group: "roads", name: "Keep", points: [], lock: true },
        { i: 2, group: "trails", name: "Reroll1", points: [] },
        { i: 3, group: "searoutes", name: "KeepToo", points: [], lock: true },
        { i: 4, group: "roads", name: "Reroll2", points: [] },
      ],
      generateName: () => `Fresh ${++counter}`,
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 4,
      regenerated: 2,
      locked: 2,
    });
    expect(generateName).toHaveBeenCalledTimes(2);

    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.name).toBe("Old A"); // setup data, untouched (lock honored)
    expect(pack.routes[2]?.name).toBe("Fresh 1");
    expect(pack.routes[3]?.name).toBe("Old C"); // setup data, untouched (lock honored)
    expect(pack.routes[4]?.name).toBe("Fresh 2");
  });

  it("routes with no current name receive a generated name", async () => {
    const { runtime } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 4, group: "roads", points: [] }, // no name
      ],
      generateName: () => "Brand New",
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 1,
      regenerated: 1,
      locked: 0,
    });

    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[4]?.name).toBe("Brand New");
  });

  it("errors when pack.routes is empty", async () => {
    const { runtime } = makeRuntime({ getRoutes: () => [] });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("pack.routes is empty.");
  });

  it("errors when pack.routes is missing (getRoutes throws)", async () => {
    const { runtime } = makeRuntime({
      getRoutes: () => {
        throw new Error("pack.routes is not available.");
      },
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "pack.routes is not available.",
    );
  });

  it("skips index 0 (placeholder convention)", async () => {
    const { runtime, generateName } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "Placeholder", points: [] },
      ],
      generateName: () => "Should not be called",
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 0,
      regenerated: 0,
      locked: 0,
    });
    expect(generateName).not.toHaveBeenCalled();

    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[0]?.name).toBe("Placeholder");
  });

  it("tool name is regenerate_all_route_names", () => {
    expect(regenerateAllRouteNamesTool.name).toBe("regenerate_all_route_names");
  });

  it("stub runtime: getRoutes called once, generateName called once per unlocked non-zero route", async () => {
    const { runtime, getRoutes, generateName } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 1, group: "roads", name: "A", points: [] },
        { i: 2, group: "trails", name: "B", points: [], lock: true },
        { i: 3, group: "searoutes", name: "C", points: [] },
      ],
      generateName: () => "X",
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    await tool.execute({});

    expect(getRoutes).toHaveBeenCalledTimes(1);
    // Index 0 skipped, locked skipped → 2 unlocked non-zero routes call generateName.
    expect(generateName).toHaveBeenCalledTimes(2);
    expect(generateName).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ i: 1 }),
    );
    expect(generateName).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ i: 3 }),
    );
  });

  it("surfaces generateName throws with route id", async () => {
    const { runtime } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 5, group: "roads", name: "Old", points: [] },
      ],
      generateName: () => {
        throw new Error("boom");
      },
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Route 5: boom");
  });

  it("rejects empty/whitespace generator output with route id", async () => {
    const { runtime } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 7, group: "roads", name: "Old", points: [] },
      ],
      generateName: () => "   ",
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Route 7: name generator returned an empty/invalid name.",
    );
  });

  it("trims generator output before storing", async () => {
    const { runtime } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 2, group: "roads", name: "Old", points: [] },
      ],
      generateName: () => "  Spaced  ",
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[2]?.name).toBe("Spaced");
  });

  it("ignores routes flagged removed", async () => {
    const { runtime, generateName } = makeRuntime({
      getRoutes: () => [
        { i: 0, group: "roads", name: "P", points: [] },
        { i: 1, group: "roads", name: "Gone", points: [], removed: true },
        { i: 2, group: "roads", name: "Live", points: [] },
      ],
      generateName: () => "Renamed",
    });
    const tool = createRegenerateAllRouteNamesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 1,
      regenerated: 1,
      locked: 0,
    });
    expect(generateName).toHaveBeenCalledTimes(1);
  });
});

describe("regenerate_all_route_names registry round-trip", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 0, group: "roads", name: "Placeholder", points: [] },
        {
          i: 1,
          group: "roads",
          name: "Old A",
          points: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        },
        {
          i: 2,
          group: "trails",
          name: "Old B",
          points: [
            [7, 8, 9],
            [10, 11, 12],
          ],
        },
      ] satisfies RawRoute[],
    };
    let counter = 0;
    (globalThis as { Routes?: unknown }).Routes = {
      generateName: () => `Renamed ${++counter}`,
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
  });

  it("registers and runs through the registry, mutating pack.routes[i].name", async () => {
    const registry = new ToolRegistry();
    registry.register(regenerateAllRouteNamesTool);

    const result = await registry.run("regenerate_all_route_names", {});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 2,
      regenerated: 2,
      locked: 0,
    });

    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[0]?.name).toBe("Placeholder"); // i=0 skipped
    expect(pack.routes[1]?.name).toBe("Renamed 1");
    expect(pack.routes[2]?.name).toBe("Renamed 2");
  });
});

describe("defaultRegenerateAllRouteNamesRuntime (integration)", () => {
  const generateName = vi.fn(
    (_route: { group: string; points: number[][] }) => "Generated",
  );

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    generateName.mockReset();
    let counter = 0;
    generateName.mockImplementation(() => `Live ${++counter}`);

    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 0, group: "roads", name: "Placeholder", points: [] },
        {
          i: 1,
          group: "roads",
          name: "First",
          points: [
            [10, 20, 1],
            [30, 40, 2],
          ],
        },
        {
          i: 2,
          group: "trails",
          name: "Second",
          points: [
            [50, 60, 3],
            [70, 80, 4],
          ],
          lock: true,
        },
        {
          i: 3,
          group: "searoutes",
          points: [
            [90, 100, 5],
            [110, 120, 6],
          ],
        },
      ] satisfies RawRoute[],
    };
    (globalThis as { Routes?: unknown }).Routes = { generateName };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
  });

  it("integrates with live globalThis.pack.routes and Routes.generateName", async () => {
    const result = await regenerateAllRouteNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      total: 3,
      regenerated: 2,
      locked: 1,
    });

    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[0]?.name).toBe("Placeholder"); // i=0 skipped
    expect(pack.routes[1]?.name).toBe("Live 1");
    expect(pack.routes[2]?.name).toBe("Second"); // locked
    expect(pack.routes[3]?.name).toBe("Live 2");

    // Routes.generateName was invoked with each unlocked route's group/points
    expect(generateName).toHaveBeenCalledTimes(2);
    expect(generateName).toHaveBeenNthCalledWith(1, {
      group: "roads",
      points: [
        [10, 20, 1],
        [30, 40, 2],
      ],
    });
    expect(generateName).toHaveBeenNthCalledWith(2, {
      group: "searoutes",
      points: [
        [90, 100, 5],
        [110, 120, 6],
      ],
    });
  });

  it("errors when pack.routes is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await regenerateAllRouteNamesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "pack.routes is not available.",
    );
  });

  it("errors when globalThis.Routes is missing", async () => {
    (globalThis as { Routes?: unknown }).Routes = undefined;
    const result = await regenerateAllRouteNamesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Routes/);
  });

  it("errors when Routes.generateName is not a function", async () => {
    (globalThis as { Routes?: unknown }).Routes = { generateName: "nope" };
    const result = await regenerateAllRouteNamesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Routes\.generateName/);
  });

  it("errors when pack.routes is empty", async () => {
    (globalThis as { pack?: unknown }).pack = { routes: [] };
    const result = await regenerateAllRouteNamesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("pack.routes is empty.");
  });
});
