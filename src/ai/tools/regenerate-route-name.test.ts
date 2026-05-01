import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRegenerateRouteNameTool,
  type RegenerateRouteNameRef,
  type RegenerateRouteNameRuntime,
  regenerateRouteNameTool,
} from "./regenerate-route-name";

function makeRuntime(overrides: Partial<RegenerateRouteNameRuntime> = {}): {
  runtime: RegenerateRouteNameRuntime;
  find: ReturnType<typeof vi.fn<RegenerateRouteNameRuntime["find"]>>;
  generate: ReturnType<typeof vi.fn<RegenerateRouteNameRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateRouteNameRuntime["apply"]>>;
} {
  const find = vi.fn<RegenerateRouteNameRuntime["find"]>(
    overrides.find ?? (() => null),
  );
  const generate = vi.fn<RegenerateRouteNameRuntime["generate"]>(
    overrides.generate ?? (() => "Generated"),
  );
  const apply = vi.fn<RegenerateRouteNameRuntime["apply"]>(
    overrides.apply ?? (() => undefined),
  );
  return {
    runtime: { find, generate, apply },
    find,
    generate,
    apply,
  };
}

describe("regenerate_route_name tool (stub runtime)", () => {
  it("happy path by id", async () => {
    const ref: RegenerateRouteNameRef = {
      i: 5,
      name: "Old",
      group: "roads",
      points: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    };
    const { runtime, generate, apply } = makeRuntime({
      find: (r) => (r === 5 ? ref : null),
      generate: () => "Hello Road",
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 5 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledWith(ref);
    expect(apply).toHaveBeenCalledWith(5, "Hello Road");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Old",
      name: "Hello Road",
    });
  });

  it("happy path by case-insensitive name", async () => {
    const ref: RegenerateRouteNameRef = {
      i: 5,
      name: "Silk Trail",
      group: "trails",
      points: [],
    };
    const find = vi.fn<RegenerateRouteNameRuntime["find"]>((r) =>
      typeof r === "string" && r.toLowerCase() === "silk trail" ? ref : null,
    );
    const { runtime, apply } = makeRuntime({
      find,
      generate: () => "Iron Passage",
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: "SILK trail" });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("SILK trail");
    expect(apply).toHaveBeenCalledWith(5, "Iron Passage");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Silk Trail",
      name: "Iron Passage",
    });
  });

  it("happy path with route id 0 (routes start at 0, no placeholder slot)", async () => {
    const ref: RegenerateRouteNameRef = {
      i: 0,
      name: "First",
      group: "roads",
      points: [],
    };
    const { runtime, apply } = makeRuntime({
      find: (r) => (r === 0 ? ref : null),
      generate: () => "Renamed",
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 0 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(0, "Renamed");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 0,
      previousName: "First",
      name: "Renamed",
    });
  });

  it("trims generator output", async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 1, name: "Old", group: "roads", points: [] }),
      generate: () => "  Spaced  ",
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 1 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "Spaced");
    expect(JSON.parse(result.content).name).toBe("Spaced");
  });

  it("rejects empty generator output; pack unchanged", async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 1, name: "Old", group: "roads", points: [] }),
      generate: () => "",
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Name generator returned an empty/invalid name.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only generator output; pack unchanged", async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 1, name: "Old", group: "roads", points: [] }),
      generate: () => "    ",
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Name generator returned an empty/invalid name.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string generator output; pack unchanged", async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 1, name: "Old", group: "roads", points: [] }),
      generate: () => 42 as unknown as string,
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Name generator returned an empty/invalid name.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces generator throws; pack unchanged", async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 1, name: "Old", group: "roads", points: [] }),
      generate: () => {
        throw new Error("Routes.generateName boom");
      },
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Routes\.generateName boom/,
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces apply throws", async () => {
    const runtime: RegenerateRouteNameRuntime = {
      find: () => ({ i: 1, name: "Old", group: "roads", points: [] }),
      generate: () => "X",
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });

  it("route not found by id", async () => {
    const { runtime, generate, apply } = makeRuntime({ find: () => null });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No route found matching 999.",
    );
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("route not found by name", async () => {
    const { runtime, generate, apply } = makeRuntime({ find: () => null });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: "Ghost" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      'No route found matching "Ghost".',
    );
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("missing route param errors; no find", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "route must be a non-negative integer id or a non-empty name string.",
    );
    expect(find).not.toHaveBeenCalled();
  });

  it("rejects bad route types; no find", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createRegenerateRouteNameTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, "", "   ", {}, true]) {
      const r = await tool.execute({ route: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "route must be a non-negative integer id or a non-empty name string.",
      );
    }
    expect(find).not.toHaveBeenCalled();
  });

  it('previousName defaults to "" when find returns name ""', async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 3, name: "", group: "roads", points: [] }),
      generate: () => "Y",
    });
    const tool = createRegenerateRouteNameTool(runtime);
    const result = await tool.execute({ route: 3 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, "Y");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      previousName: "",
      name: "Y",
    });
  });

  it("has correct tool name and required-schema fields", () => {
    expect(regenerateRouteNameTool.name).toBe("regenerate_route_name");
    expect(regenerateRouteNameTool.input_schema.required).toEqual(["route"]);
  });
});

describe("regenerate_route_name registry round-trip", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        {
          i: 0,
          group: "roads",
          name: "Old Road",
          points: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        },
      ] satisfies RawRoute[],
    };
    (globalThis as { Routes?: unknown }).Routes = {
      generateName: () => "Renamed Road",
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(regenerateRouteNameTool);
    const result = await registry.run("regenerate_route_name", { route: 0 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 0,
      previousName: "Old Road",
      name: "Renamed Road",
    });
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[0]?.name).toBe("Renamed Road");
  });
});

describe("defaultRegenerateRouteNameRuntime (integration)", () => {
  const generateName = vi.fn(
    (_route: { group: string; points: number[][] }) => "Generated Name",
  );

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    generateName.mockReset();
    generateName.mockReturnValue("Generated Name");

    (globalThis as { pack?: unknown }).pack = {
      routes: [
        {
          i: 0,
          group: "roads",
          name: "First Road",
          points: [
            [10, 20, 1],
            [30, 40, 2],
          ],
        },
        {
          i: 5,
          group: "trails",
          name: "Silk Trail",
          points: [
            [50, 60, 3],
            [70, 80, 4],
          ],
        },
        {
          i: 9,
          group: "searoutes",
          name: "Old Sea",
          removed: true,
          points: [],
        },
      ] satisfies RawRoute[],
    };
    (globalThis as { Routes?: unknown }).Routes = { generateName };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Routes?: unknown }).Routes = originalRoutes;
  });

  it("id 0: mutates routes[0].name and calls generateName with the route's group/points", async () => {
    const result = await regenerateRouteNameTool.execute({ route: 0 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[0]?.name).toBe("Generated Name");
    expect(generateName).toHaveBeenCalledTimes(1);
    expect(generateName).toHaveBeenCalledWith({
      group: "roads",
      points: [
        [10, 20, 1],
        [30, 40, 2],
      ],
    });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 0,
      previousName: "First Road",
      name: "Generated Name",
    });
  });

  it("id 5 at non-contiguous slot: mutates routes[1].name", async () => {
    const result = await regenerateRouteNameTool.execute({ route: 5 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.name).toBe("Generated Name");
    expect(generateName).toHaveBeenCalledWith({
      group: "trails",
      points: [
        [50, 60, 3],
        [70, 80, 4],
      ],
    });
  });

  it("removed route id 9: errors and leaves the route untouched", async () => {
    const result = await regenerateRouteNameTool.execute({ route: 9 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("No route found matching 9.");
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[2]?.name).toBe("Old Sea");
    expect(generateName).not.toHaveBeenCalled();
  });

  it("name match (case-insensitive): resolves and mutates", async () => {
    const result = await regenerateRouteNameTool.execute({
      route: "silk TRAIL",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[1]?.name).toBe("Generated Name");
    expect(JSON.parse(result.content).previousName).toBe("Silk Trail");
  });

  it("missing globalThis.Routes → error mentions Routes", async () => {
    (globalThis as { Routes?: unknown }).Routes = undefined;
    const result = await regenerateRouteNameTool.execute({ route: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Routes/);
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[0]?.name).toBe("First Road");
  });

  it("Routes.generateName not a function → error mentions Routes.generateName", async () => {
    (globalThis as { Routes?: unknown }).Routes = { generateName: "nope" };
    const result = await regenerateRouteNameTool.execute({ route: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Routes\.generateName/);
    const pack = (globalThis as { pack: { routes: RawRoute[] } }).pack;
    expect(pack.routes[0]?.name).toBe("First Road");
  });

  it("missing pack.routes → not-found error", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await regenerateRouteNameTool.execute({ route: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("No route found matching 0.");
  });
});
